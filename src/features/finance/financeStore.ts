import dayjs from "dayjs";
import { create } from "zustand";
import type { Account, Category, Currency, RecurringRule, Transaction, TransactionItem } from "../../shared/types/finance";
import { isLiabilityAccountType, normalizeAccountInitialBalance, supportsInterestAccountType } from "../../shared/lib/accounts";
import { getDueRecurringTransactions } from "../recurring/recurring";
import { getDueInterestAccrualTransactions, INTEREST_EXPENSE_CATEGORY_NAME, INTEREST_INCOME_CATEGORY_NAME } from "../interest/interestAccrual";
import { createSeedSnapshot, defaultCategories } from "./seedData";
import type { FinanceState, NewAccountInput, NewTransactionInput } from "./financeTypes";
import {
  insertPortfolio, loadFinanceData, resetFinanceData as deleteAllFinanceData, saveAccount, saveCategories,
  saveGenerated, saveRecurringRules, saveTransaction, updatePortfolio,
} from "./financeRepository";

let currentOwnerId = "";
const empty = createSeedSnapshot();

function uid(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }
function getRecurringEndsAt(startsAt: string, months?: number) { return months && months > 0 ? dayjs(startsAt).add(months - 1, "month").endOf("month").toISOString() : undefined; }
function canCreateRecurring(type: Transaction["type"]) { return type === "income" || type === "expense"; }

function inferAccountCurrency(account: Pick<Account, "name" | "type" | "currency" | "initialBalance">): Currency {
  if (/(?:₽|rub|ruble|rubles|руб|рубл)/i.test(account.name)) return "RUB";
  if (/(?:₾|gel|lari|lar|лар(?:и|а|ов)?|грузинск(?:ий|их|ие|ими)?\s+лар|ლარ(?:ი)?)/i.test(account.name)) return "GEL";
  if (/(?:฿|thb|baht|бат)/i.test(account.name)) return "THB";
  if (/(?:\$|usd|dollar|dollars|доллар)/i.test(account.name)) return "USD";
  return account.currency;
}

function normalizeAccountInput(input: NewAccountInput) {
  const supportsInterest = supportsInterestAccountType(input.type);
  return {
    ...input, currency: inferAccountCurrency(input), initialBalance: normalizeAccountInitialBalance(input.type, input.initialBalance),
    annualInterestRate: supportsInterest ? input.annualInterestRate : undefined,
    interestFrequency: supportsInterest ? input.interestFrequency : undefined,
    interestStartedAt: supportsInterest ? input.interestStartedAt : undefined,
    interestAllocationAccountId: supportsInterest && !isLiabilityAccountType(input.type) ? input.interestAllocationAccountId : undefined,
    loanTermMonths: isLiabilityAccountType(input.type) ? input.loanTermMonths : undefined,
  };
}

async function bootstrapUser(ownerId: string, name: string) {
  const seed = createSeedSnapshot(name);
  const portfolio = { ...seed.portfolios[0], id: uid("portfolio") };
  const snapshot = {
    ...seed,
    activePortfolioId: portfolio.id,
    portfolios: [portfolio],
    categories: seed.categories.map((category) => ({ ...category, id: uid("cat"), portfolioId: portfolio.id })),
    accounts: seed.accounts.map((account) => ({ ...account, id: uid("acc"), portfolioId: portfolio.id })),
  };
  await insertPortfolio(portfolio, ownerId);
  await saveCategories(snapshot.categories);
  for (const account of snapshot.accounts) await saveAccount(account);
  return snapshot;
}

export async function initializeFinanceData(ownerId: string, portfolioName: string) {
  currentOwnerId = ownerId;
  const loaded = await loadFinanceData();
  const snapshot = loaded.portfolios.some((portfolio) => !portfolio.deletedAt) ? loaded : await bootstrapUser(ownerId, portfolioName);
  useFinanceStore.setState(snapshot);
}

function buildTransaction(input: NewTransactionInput, portfolioId: string, existing?: Transaction) {
  const isRecurring = Boolean(input.recurring && canCreateRecurring(input.type));
  const recurringRuleId = isRecurring ? existing?.recurringRuleId ?? uid("rec") : existing?.recurringRuleId;
  const transaction: Transaction = {
    id: existing?.id ?? uid("tx"), portfolioId, accountId: input.accountId, type: input.type, amount: input.amount,
    currency: input.currency, categoryId: input.categoryId, linkedAccountId: input.linkedAccountId,
    principalAmount: input.principalAmount, interestAmount: input.interestAmount, description: input.description,
    occurredAt: input.occurredAt, source: isRecurring ? "recurring" : input.source ?? existing?.source ?? "manual", recurringRuleId,
  };
  const items: TransactionItem[] = (input.items ?? []).map((item) => ({ ...item, id: uid("item"), transactionId: transaction.id }));
  const rule: RecurringRule | undefined = isRecurring && recurringRuleId ? {
    id: recurringRuleId, portfolioId, accountId: input.accountId, type: input.type === "income" ? "income" as const : "expense" as const,
    amount: input.amount, currency: input.currency, categoryId: input.categoryId, description: input.description,
    dayOfMonth: dayjs(input.occurredAt).date(), startsAt: input.occurredAt, endsAt: getRecurringEndsAt(input.occurredAt, input.recurringMonths), isActive: true,
  } : undefined;
  return { transaction, items, rule };
}

export const useFinanceStore = create<FinanceState>()((set, get) => ({
  ...empty,
  setActivePortfolio: (activePortfolioId) => set({ activePortfolioId }),
  setTimeframe: (timeframe) => set({ timeframe }),
  setTransactionFilter: (transactionFilter) => set({ transactionFilter }),
  setCurrencyDisplay: (currencyDisplay) => set({ currencyDisplay }),
  addPortfolio: async (name, baseCurrency) => {
    const portfolio = { id: uid("portfolio"), name, baseCurrency };
    const categories: Category[] = defaultCategories.map((category) => ({ ...category, id: uid("cat"), portfolioId: portfolio.id }));
    await insertPortfolio(portfolio, currentOwnerId); await saveCategories(categories);
    set((state) => ({ portfolios: [...state.portfolios, portfolio], categories: [...state.categories, ...categories], activePortfolioId: portfolio.id }));
  },
  renamePortfolio: async (id, name) => {
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error("Portfolio name is required");
    await updatePortfolio(id, { name: normalizedName });
    set((state) => ({ portfolios: state.portfolios.map((portfolio) => portfolio.id === id ? { ...portfolio, name: normalizedName } : portfolio) }));
  },
  deletePortfolio: async (id) => {
    const deletedAt = new Date().toISOString(); await updatePortfolio(id, { deleted_at: deletedAt });
    set((state) => { const portfolios = state.portfolios.map((p) => p.id === id ? { ...p, deletedAt } : p); return { portfolios, activePortfolioId: portfolios.find((p) => !p.deletedAt)?.id ?? "" }; });
  },
  addAccount: async (input) => {
    const state = get(); const normalized = normalizeAccountInput(input);
    const account: Account = { id: uid("acc"), portfolioId: state.activePortfolioId, color: ["#4fb6e8", "#5fd38a", "#e8b94c", "#9b82e6"][state.accounts.length % 4], ...normalized };
    await saveAccount(account); set((value) => ({ accounts: [...value.accounts, account] }));
  },
  updateAccount: async (id, input) => {
    const account = get().accounts.find((item) => item.id === id); if (!account) throw new Error("Account not found");
    const updated = { ...account, ...normalizeAccountInput(input) }; await saveAccount(updated);
    set((state) => ({ accounts: state.accounts.map((item) => item.id === id ? updated : item) }));
  },
  archiveAccount: async (id) => {
    const account = get().accounts.find((item) => item.id === id); if (!account) throw new Error("Account not found");
    const updated = { ...account, isArchived: true, deletedAt: undefined }; await saveAccount(updated);
    set((state) => ({ accounts: state.accounts.map((item) => item.id === id ? updated : item) }));
  },
  addCategory: async (input) => {
    const category: Category = { id: uid("cat"), portfolioId: get().activePortfolioId, ...input }; await saveCategories([category]);
    set((state) => ({ categories: [...state.categories, category] }));
  },
  addTransaction: async (input) => {
    const built = buildTransaction(input, get().activePortfolioId); await saveTransaction(built.transaction, built.items, built.rule);
    set((state) => ({ transactions: [...state.transactions, built.transaction], transactionItems: [...state.transactionItems, ...built.items], recurringRules: built.rule ? [...state.recurringRules, built.rule] : state.recurringRules }));
  },
  updateTransaction: async (id, input) => {
    const state = get(); const existing = state.transactions.find((item) => item.id === id); if (!existing) throw new Error("Transaction not found");
    const built = buildTransaction(input, existing.portfolioId, existing);
    let rule: RecurringRule | undefined = built.rule;
    if (!rule && existing.recurringRuleId) { const old = state.recurringRules.find((item) => item.id === existing.recurringRuleId); if (old) { rule = { ...old, isActive: false }; await saveRecurringRules([rule]); } }
    await saveTransaction(built.transaction, built.items, built.rule);
    set((value) => ({ transactions: value.transactions.map((item) => item.id === id ? built.transaction : item),
      transactionItems: [...value.transactionItems.filter((item) => item.transactionId !== id), ...built.items],
      recurringRules: rule ? [...value.recurringRules.filter((item) => item.id !== rule.id), rule] : value.recurringRules }));
  },
  deleteTransaction: async (id) => {
    const state = get(); const tx = state.transactions.find((item) => item.id === id); if (!tx) throw new Error("Transaction not found");
    const deleted = { ...tx, deletedAt: new Date().toISOString() }; await saveTransaction(deleted, state.transactionItems.filter((item) => item.transactionId === id));
    set((value) => ({ transactions: value.transactions.map((item) => item.id === id ? deleted : item) }));
  },
  generateDueRecurring: async () => {
    const state = get(); const portfolioId = state.activePortfolioId; if (!portfolioId) return;
    const required = [{ name: INTEREST_INCOME_CATEGORY_NAME, type: "income" as const, color: "#5fd38a" }, { name: INTEREST_EXPENSE_CATEGORY_NAME, type: "expense" as const, color: "#f07f86" }];
    const categories = required.filter((r) => !state.categories.some((c) => c.portfolioId === portfolioId && c.name === r.name && c.type === r.type)).map((r) => ({ id:uid("cat"), portfolioId, ...r }));
    const allCategories = [...state.categories, ...categories];
    const recurring = getDueRecurringTransactions({ rules:state.recurringRules, transactions:state.transactions, portfolioId, date:dayjs(), createId:() => uid("tx") });
    const interest = getDueInterestAccrualTransactions({ accounts:state.accounts, categories:allCategories, transactions:[...state.transactions, ...recurring], portfolioId, date:dayjs(), createId:() => uid("tx") });
    const transactions = [...recurring, ...interest]; await saveGenerated(categories, transactions);
    if (categories.length || transactions.length) set({ categories:allCategories, transactions:[...state.transactions, ...transactions] });
  },
  resetFinanceData: async () => {
    await deleteAllFinanceData(get().portfolios.map((p) => p.id)); const snapshot = await bootstrapUser(currentOwnerId, "Personal"); set(snapshot);
  },
}));
