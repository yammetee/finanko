import type { Account, Category, Transaction, TransactionItem } from "../../shared/types/finance";
import { isLiabilityAccountType, normalizeAccountInitialBalance } from "../../shared/lib/accounts";
import { decimalToMinor } from "./money";
import { buildAccountOnlyEntry, buildLedgerEntry } from "./postings";
import type { EntryItem, LedgerAccount, LedgerEntry, LedgerSnapshot } from "./ledgerTypes";

function mapAccount(account: Account): LedgerAccount {
  return {
    id: account.id,
    portfolioId: account.portfolioId,
    name: account.name,
    type: account.type,
    currency: account.currency,
    openingBalanceMinor: decimalToMinor(
      normalizeAccountInitialBalance(account.type, account.initialBalance),
      account.currency,
    ),
    deletedAt: account.deletedAt,
  };
}

function mapTransaction(
  transaction: Transaction,
  accounts: Account[],
  categories: Category[],
  transactionItems: TransactionItem[] = [],
): LedgerEntry {
  const amountMinor = decimalToMinor(transaction.amount, transaction.currency);
  const category = categories.find((candidate) => candidate.id === transaction.categoryId);

  if (transaction.type === "interest_accrual") {
    const linkedAccount = accounts.find((account) => account.id === transaction.linkedAccountId);
    const isExpense = category?.type === "expense" || Boolean(linkedAccount && isLiabilityAccountType(linkedAccount.type));

    return buildLedgerEntry({
      id: transaction.id,
      portfolioId: transaction.portfolioId,
      kind: "interest_accrual",
      occurredAt: transaction.occurredAt,
      description: transaction.description,
      source: transaction.source,
      deletedAt: transaction.deletedAt,
      postings: [
        {
          accountId: transaction.accountId,
          amountMinor,
          currency: transaction.currency,
          direction: isExpense ? "decrease" : "increase",
          role: isExpense ? "liability_interest" : "cash",
        },
        {
          categoryId: transaction.categoryId,
          amountMinor,
          currency: transaction.currency,
          direction: "increase",
          role: isExpense ? "expense" : "income",
        },
      ],
    });
  }

  if (transaction.type === "debt_payment") {
    if (!transaction.linkedAccountId) {
      throw new Error(`Debt payment transaction ${transaction.id} is missing linked account`);
    }

    const principalAmount = transaction.principalAmount ?? transaction.amount;
    const interestAmount = transaction.interestAmount ?? 0;
    const principalMinor = decimalToMinor(principalAmount, transaction.currency);
    const interestMinor = decimalToMinor(interestAmount, transaction.currency);

    return buildLedgerEntry({
      id: transaction.id,
      portfolioId: transaction.portfolioId,
      kind: "debt_payment",
      occurredAt: transaction.occurredAt,
      description: transaction.description,
      source: transaction.source,
      deletedAt: transaction.deletedAt,
      postings: [
        {
          accountId: transaction.accountId,
          amountMinor,
          currency: transaction.currency,
          direction: "decrease",
          role: "cash",
        },
        {
          accountId: transaction.linkedAccountId,
          amountMinor: principalMinor,
          currency: transaction.currency,
          direction: "increase",
          role: "liability_principal",
        },
        ...(interestMinor > 0
          ? [
              {
                categoryId: transaction.categoryId,
                amountMinor: interestMinor,
                currency: transaction.currency,
                direction: "increase" as const,
                role: "expense" as const,
              },
            ]
          : []),
      ],
    });
  }

  if (transaction.type === "income") {
    return buildLedgerEntry({
      id: transaction.id,
      portfolioId: transaction.portfolioId,
      kind: "income",
      occurredAt: transaction.occurredAt,
      description: transaction.description,
      source: transaction.source,
      deletedAt: transaction.deletedAt,
      postings: [
        {
          accountId: transaction.accountId,
          amountMinor,
          currency: transaction.currency,
          direction: "increase",
          role: "cash",
        },
        {
          categoryId: transaction.categoryId,
          amountMinor,
          currency: transaction.currency,
          direction: "increase",
          role: category?.type === "expense" ? "expense" : "income",
        },
      ],
    });
  }

  if (transaction.type === "expense") {
    const itemPostings =
      transactionItems.length > 0
        ? transactionItems.map((item) => ({
            categoryId: item.categoryId,
            amountMinor: decimalToMinor(Math.abs(item.amount), transaction.currency),
            currency: transaction.currency,
            direction: item.amount < 0 ? "decrease" as const : "increase" as const,
            role: "expense" as const,
          }))
        : [
            {
              categoryId: transaction.categoryId,
              amountMinor,
              currency: transaction.currency,
              direction: "increase" as const,
              role: "expense" as const,
            },
          ];

    return buildLedgerEntry({
      id: transaction.id,
      portfolioId: transaction.portfolioId,
      kind: "expense",
      occurredAt: transaction.occurredAt,
      description: transaction.description,
      source: transaction.source,
      deletedAt: transaction.deletedAt,
      postings: [
        {
          accountId: transaction.accountId,
          amountMinor,
          currency: transaction.currency,
          direction: "decrease",
          role: "cash",
        },
        ...itemPostings,
      ],
    });
  }

  return buildAccountOnlyEntry({
    id: transaction.id,
    portfolioId: transaction.portfolioId,
    kind: "adjustment",
    accountId: transaction.accountId,
    amountMinor,
    currency: transaction.currency,
    direction: "increase",
    occurredAt: transaction.occurredAt,
    description: transaction.description,
    source: transaction.source,
    deletedAt: transaction.deletedAt,
    role: "adjustment",
  });
}

function mapItem(item: TransactionItem, transaction: Transaction | undefined): EntryItem {
  const currency = transaction?.currency ?? "USD";
  return {
    id: item.id,
    entryId: item.transactionId,
    name: item.name,
    amountMinor: decimalToMinor(item.amount, currency),
    currency,
    categoryId: item.categoryId,
    confidence: item.confidence,
  };
}

export function financeStateToLedgerSnapshot(input: {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  transactionItems?: TransactionItem[];
}): LedgerSnapshot {
  const transactionsById = new Map(input.transactions.map((transaction) => [transaction.id, transaction]));
  const itemsByTransactionId = new Map<string, TransactionItem[]>();
  (input.transactionItems ?? []).forEach((item) => {
    itemsByTransactionId.set(item.transactionId, [
      ...(itemsByTransactionId.get(item.transactionId) ?? []),
      item,
    ]);
  });

  return {
    accounts: input.accounts.map(mapAccount),
    categories: input.categories.map((category) => ({
      id: category.id,
      portfolioId: category.portfolioId,
      type: category.type,
    })),
    entries: input.transactions.map((transaction) =>
      mapTransaction(
        transaction,
        input.accounts,
        input.categories,
        itemsByTransactionId.get(transaction.id) ?? [],
      ),
    ),
    items: (input.transactionItems ?? []).map((item) => mapItem(item, transactionsById.get(item.transactionId))),
  };
}
