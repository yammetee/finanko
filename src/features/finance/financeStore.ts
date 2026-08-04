import { create } from "zustand";
import type { Account, Category, Transaction, TransactionItem } from "../../shared/types/finance";
import { createDefaultCategories, createSeedSnapshot } from "./seedData";
import type { FinanceSnapshot, FinanceState, NewExpenseInput } from "./financeTypes";
import {
  insertPortfolio,
  loadFinanceData,
  saveAccount,
  saveCategories,
  saveTransaction,
} from "./financeRepository";

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function getPrimaryPortfolio(snapshot: FinanceSnapshot) {
  return snapshot.portfolios.find(
    (portfolio) => portfolio.id === snapshot.activePortfolioId && !portfolio.deletedAt,
  ) ?? snapshot.portfolios.find((portfolio) => !portfolio.deletedAt);
}

function getExpenseAccount(snapshot: FinanceSnapshot, portfolioId: string) {
  return snapshot.accounts.find(
    (account) => account.portfolioId === portfolioId && !account.deletedAt,
  );
}

function createExpenseAccount(portfolioId: string, currency: Account["currency"]): Account {
  return {
    id: uid("acc"),
    portfolioId,
    name: "Expenses",
    type: "custom",
    currency,
    initialBalance: 0,
    color: "#38b6f0",
  };
}

async function bootstrapUser(ownerId: string, name: string): Promise<FinanceSnapshot> {
  const seed = createSeedSnapshot(name);
  const portfolio = { ...seed.portfolios[0], id: uid("portfolio") };
  const categories = createDefaultCategories(portfolio.id).map((category) => ({
    ...category,
    id: uid("cat"),
  }));
  const account = createExpenseAccount(portfolio.id, portfolio.baseCurrency);

  await insertPortfolio(portfolio, ownerId);
  await saveCategories(categories);
  await saveAccount(account);

  return {
    activePortfolioId: portfolio.id,
    portfolios: [portfolio],
    accounts: [account],
    categories,
    transactions: [],
    transactionItems: [],
  };
}

async function ensureExpenseContext(snapshot: FinanceSnapshot): Promise<FinanceSnapshot> {
  const portfolio = getPrimaryPortfolio(snapshot);
  if (!portfolio) return snapshot;

  let accounts = snapshot.accounts;
  if (!getExpenseAccount(snapshot, portfolio.id)) {
    const account = createExpenseAccount(portfolio.id, portfolio.baseCurrency);
    await saveAccount(account);
    accounts = [...accounts, account];
  }

  let categories = snapshot.categories;
  const hasExpenseCategory = categories.some(
    (category) => category.portfolioId === portfolio.id && category.type === "expense",
  );
  if (!hasExpenseCategory) {
    const defaults = createDefaultCategories(portfolio.id).map((category) => ({
      ...category,
      id: uid("cat"),
    }));
    await saveCategories(defaults);
    categories = [...categories, ...defaults];
  }

  return {
    ...snapshot,
    activePortfolioId: portfolio.id,
    accounts,
    categories,
  };
}

export async function initializeFinanceData(ownerId: string, portfolioName: string) {
  const loaded = await loadFinanceData();
  const initial = loaded.portfolios.some((portfolio) => !portfolio.deletedAt)
    ? loaded
    : await bootstrapUser(ownerId, portfolioName);
  useFinanceStore.setState(await ensureExpenseContext(initial));
}

function buildExpense(
  input: NewExpenseInput,
  portfolioId: string,
  accountId: string,
  existing?: Transaction,
) {
  const transaction: Transaction = {
    id: existing?.id ?? uid("tx"),
    portfolioId,
    accountId,
    type: "expense",
    amount: input.amount,
    currency: input.currency,
    categoryId: input.categoryId,
    linkedAccountId: existing?.linkedAccountId,
    principalAmount: existing?.principalAmount,
    interestAmount: existing?.interestAmount,
    description: input.description,
    occurredAt: input.occurredAt,
    source: input.source ?? existing?.source ?? "manual",
    recurringRuleId: existing?.recurringRuleId,
  };
  const items: TransactionItem[] = (input.items ?? []).map((item) => ({
    ...item,
    id: item.id ?? uid("item"),
    transactionId: transaction.id,
  }));
  return { transaction, items };
}

export const useFinanceStore = create<FinanceState>()((set, get) => ({
  ...createSeedSnapshot(),
  addCategory: async (input) => {
    const state = get();
    const portfolio = getPrimaryPortfolio(state);
    if (!portfolio) throw new Error("Expense portfolio is unavailable");
    const category: Category = {
      id: uid("cat"),
      portfolioId: portfolio.id,
      ...input,
    };
    await saveCategories([category]);
    set((current) => ({ categories: [...current.categories, category] }));
  },
  addTransaction: async (input) => {
    const state = get();
    const portfolio = getPrimaryPortfolio(state);
    if (!portfolio) throw new Error("Expense portfolio is unavailable");
    const account = getExpenseAccount(state, portfolio.id);
    if (!account) throw new Error("Expense account is unavailable");
    const built = buildExpense(input, portfolio.id, account.id);
    await saveTransaction(built.transaction, built.items);
    set((current) => ({
      transactions: [...current.transactions, built.transaction],
      transactionItems: [...current.transactionItems, ...built.items],
    }));
  },
  updateTransaction: async (id, input) => {
    const state = get();
    const existing = state.transactions.find((transaction) => transaction.id === id);
    if (!existing || existing.type !== "expense") throw new Error("Expense not found");
    const built = buildExpense(input, existing.portfolioId, existing.accountId, existing);
    await saveTransaction(built.transaction, built.items);
    set((current) => ({
      transactions: current.transactions.map((transaction) =>
        transaction.id === id ? built.transaction : transaction,
      ),
      transactionItems: [
        ...current.transactionItems.filter((item) => item.transactionId !== id),
        ...built.items,
      ],
    }));
  },
  deleteTransaction: async (id) => {
    const state = get();
    const existing = state.transactions.find((transaction) => transaction.id === id);
    if (!existing || existing.type !== "expense") throw new Error("Expense not found");
    const deleted = { ...existing, deletedAt: new Date().toISOString() };
    await saveTransaction(
      deleted,
      state.transactionItems.filter((item) => item.transactionId === id),
    );
    set((current) => ({
      transactions: current.transactions.map((transaction) =>
        transaction.id === id ? deleted : transaction,
      ),
    }));
  },
}));
