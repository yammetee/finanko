import dayjs, { type Dayjs } from "dayjs";
import type { Account, Category, Transaction } from "../../shared/types/finance";
import { isLiabilityAccount } from "../../shared/lib/accounts";
import { financeStateToLedgerSnapshot } from "../ledger/financeLedgerAdapter";
import { getLedgerAccountBalance } from "../ledger/balances";

export const INTEREST_INCOME_CATEGORY_NAME = "Interest income";
export const INTEREST_EXPENSE_CATEGORY_NAME = "Interest expense";
export const MVP_INTEREST_DAY_COUNT = 365;

export function getInterestCategoryName(account: Account) {
  return isLiabilityAccount(account)
    ? INTEREST_EXPENSE_CATEGORY_NAME
    : INTEREST_INCOME_CATEGORY_NAME;
}

export function getInterestPeriodKey(account: Account, date: Dayjs) {
  return account.interestFrequency === "monthly"
    ? date.format("YYYY-MM")
    : date.format("YYYY-MM-DD");
}

function getAccrualDates(account: Account, date: Dayjs) {
  if (!account.annualInterestRate || !account.interestFrequency || !account.interestStartedAt) {
    return [];
  }

  const startedAt = dayjs(account.interestStartedAt).startOf("day");
  if (!startedAt.isValid()) return [];

  if (account.interestFrequency === "monthly") {
    const firstMonth = startedAt.startOf("month");
    const currentMonth = date.startOf("month");
    const monthCount = Math.max(0, currentMonth.diff(firstMonth, "month"));
    return Array.from({ length: monthCount }, (_, index) =>
      firstMonth.add(index, "month").endOf("month"),
    );
  }

  const firstDay = startedAt.add(1, "day").startOf("day");
  const currentDay = date.startOf("day");
  const dayCount = Math.max(0, currentDay.diff(firstDay, "day") + 1);
  return Array.from({ length: dayCount }, (_, index) => firstDay.add(index, "day"));
}

function hasInterestAccrual(
  account: Account,
  transactions: Transaction[],
  accrualDate: Dayjs,
) {
  const periodKey = getInterestPeriodKey(account, accrualDate);
  return transactions.some(
    (transaction) =>
      !transaction.deletedAt &&
      transaction.type === "interest_accrual" &&
      transaction.linkedAccountId === account.id &&
      getInterestPeriodKey(account, dayjs(transaction.occurredAt)) === periodKey,
  );
}

function calculateInterestAmount(balance: number, account: Account) {
  if (!account.annualInterestRate || !account.interestFrequency) return 0;
  if (balance === 0) return 0;
  const rate = account.annualInterestRate / 100;
  const periodRate =
    account.interestFrequency === "monthly" ? rate / 12 : rate / MVP_INTEREST_DAY_COUNT;
  return Math.round(Math.abs(balance) * periodRate * 100) / 100;
}

function getBalanceBeforeDate(
  account: Account,
  accounts: Account[],
  categories: Category[],
  transactions: Transaction[],
  date: Dayjs,
) {
  const snapshot = financeStateToLedgerSnapshot({
    accounts,
    categories,
    transactions: transactions.filter((transaction) => dayjs(transaction.occurredAt).isBefore(date)),
  });
  const ledgerAccount = snapshot.accounts.find((candidate) => candidate.id === account.id);
  return ledgerAccount ? getLedgerAccountBalance(ledgerAccount, snapshot.entries) : 0;
}

export function getDueInterestAccrualTransactions({
  accounts,
  categories,
  transactions,
  portfolioId,
  date,
  createId,
}: {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  portfolioId: string;
  date: Dayjs;
  createId: () => string;
}) {
  const portfolioAccounts = accounts.filter(
    (account) =>
      account.portfolioId === portfolioId &&
      !account.deletedAt &&
      account.annualInterestRate &&
      account.interestFrequency,
  );

  return portfolioAccounts.flatMap((account) => {
    const category = categories.find(
      (candidate) =>
        candidate.portfolioId === portfolioId &&
        candidate.name === getInterestCategoryName(account),
    );
    if (!category) return [];

    const accruals: Transaction[] = [];

    getAccrualDates(account, date)
      .filter((accrualDate) => !hasInterestAccrual(account, transactions, accrualDate))
      .forEach((accrualDate) => {
        const balance = getBalanceBeforeDate(
          account,
          accounts,
          categories,
          [...transactions, ...accruals],
          accrualDate,
        );
        const amount = calculateInterestAmount(balance, account);
        if (amount <= 0) return;

        accruals.push({
          id: createId(),
          portfolioId,
          accountId: isLiabilityAccount(account)
            ? account.id
            : account.interestAllocationAccountId ?? account.id,
          linkedAccountId: account.id,
          type: "interest_accrual" as const,
          amount,
          currency: account.currency,
          categoryId: category.id,
          description: getInterestCategoryName(account),
          occurredAt: accrualDate.toISOString(),
          source: "system" as const,
        });
      });

    return accruals;
  });
}
