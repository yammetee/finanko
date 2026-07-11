import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import type {
  Account,
  Category,
  Currency,
  Timeframe,
  Transaction,
  TransactionItem,
} from "../../shared/types/finance";
import {
  buildLedgerAnalytics,
  filterPeriodEntries,
  getPeriod,
} from "../ledger/analytics";
import {
  getLedgerAccountBalance,
  getLedgerAccountBalanceInCurrency,
} from "../ledger/balances";
import { financeStateToLedgerSnapshot } from "../ledger/financeLedgerAdapter";

dayjs.extend(isoWeek);

export { getPeriod };

export function filterVisibleTransactions(
  transactions: Transaction[],
  portfolioId: string,
) {
  return transactions.filter(
    (transaction) => transaction.portfolioId === portfolioId && !transaction.deletedAt,
  );
}

export function filterPeriodTransactions(
  transactions: Transaction[],
  timeframe: Timeframe,
) {
  const entries = financeStateToLedgerSnapshot({
    accounts: [],
    categories: [],
    transactions,
  }).entries;
  const periodEntryIds = new Set(
    filterPeriodEntries(entries, timeframe).map((entry) => entry.id),
  );

  return transactions.filter((transaction) => periodEntryIds.has(transaction.id));
}

export function getAccountBalance(
  account: Account,
  transactions: Transaction[],
  accounts: Account[] = [account],
) {
  const snapshot = financeStateToLedgerSnapshot({
    accounts,
    categories: [],
    transactions,
  });
  const ledgerAccount = snapshot.accounts.find((candidate) => candidate.id === account.id);
  if (!ledgerAccount) return 0;
  return getLedgerAccountBalance(ledgerAccount, snapshot.entries);
}

export function getAccountBalanceInCurrency(
  account: Account,
  transactions: Transaction[],
  currency: Currency,
  date?: string,
  accounts: Account[] = [account],
) {
  const snapshot = financeStateToLedgerSnapshot({
    accounts,
    categories: [],
    transactions,
  });
  const ledgerAccount = snapshot.accounts.find((candidate) => candidate.id === account.id);
  if (!ledgerAccount) return 0;
  return getLedgerAccountBalanceInCurrency(
    ledgerAccount,
    snapshot.entries,
    currency,
    date,
  );
}

export function buildAnalytics(
  accounts: Account[],
  categories: Category[],
  transactions: Transaction[],
  timeframe: Timeframe,
  baseCurrency: Currency,
  transactionItems: TransactionItem[] = [],
) {
  const snapshot = financeStateToLedgerSnapshot({
    accounts,
    categories,
    transactions,
    transactionItems,
  });

  return buildLedgerAnalytics(
    snapshot.accounts,
    categories,
    snapshot.entries,
    timeframe,
    baseCurrency,
  );
}
