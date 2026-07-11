import dayjs from "dayjs";
import { create } from "zustand";
import { createJSONStorage, persist, type PersistStorage, type StateStorage } from "zustand/middleware";
import type { FinanceSnapshot, FinanceState, NewAccountInput } from "./financeTypes";
import {
  createSeedSnapshot,
  defaultCategories,
  obsoleteSeedAccountIds,
  seedCategoryIds,
  seedPortfolioId,
} from "./seedData";
import type { Account, Currency, Transaction } from "../../shared/types/finance";
import { getDueRecurringTransactions } from "../recurring/recurring";
import {
  getDueInterestAccrualTransactions,
  INTEREST_EXPENSE_CATEGORY_NAME,
  INTEREST_INCOME_CATEGORY_NAME,
} from "../interest/interestAccrual";
import {
  isLiabilityAccountType,
  normalizeAccountInitialBalance,
  supportsInterestAccountType,
} from "../../shared/lib/accounts";
import { getSupabaseClient, isSupabaseConfigured } from "../../shared/api/supabase";

const seedSnapshot = createSeedSnapshot();

function inferAccountCurrency(account: Pick<Account, "name" | "type" | "currency" | "initialBalance">): Currency {
  if (/(?:₽|rub|ruble|rubles|руб|рубл)/i.test(account.name)) return "RUB";
  if (/(?:₾|gel|lari|lar|лар(?:и|а|ов)?|грузинск(?:ий|их|ие|ими)?\s+лар|ლარ(?:ი)?)/i.test(account.name)) return "GEL";
  if (/(?:฿|thb|baht|бат)/i.test(account.name)) return "THB";
  if (/(?:\$|usd|dollar|dollars|доллар)/i.test(account.name)) return "USD";

  const looksLikeRussianLiability =
    isLiabilityAccountType(account.type) &&
    account.currency === "USD" &&
    Math.abs(account.initialBalance) >= 100_000 &&
    /(?:сбер|sber|тиньк|tinkoff|альфа|alfa|втб|vtb)/i.test(account.name);

  return looksLikeRussianLiability ? "RUB" : account.currency;
}

function normalizeAccountCurrency<T extends Pick<Account, "name" | "type" | "currency" | "initialBalance">>(
  account: T,
) {
  return {
    ...account,
    currency: inferAccountCurrency(account),
  };
}

function normalizeAccountInput<T extends NewAccountInput>(input: T) {
  const supportsInterest = supportsInterestAccountType(input.type);
  return {
    ...normalizeAccountCurrency(input),
    initialBalance: normalizeAccountInitialBalance(input.type, input.initialBalance),
    annualInterestRate: supportsInterest ? input.annualInterestRate : undefined,
    interestFrequency: supportsInterest ? input.interestFrequency : undefined,
    interestStartedAt: supportsInterest ? input.interestStartedAt : undefined,
    interestAllocationAccountId:
      supportsInterest && !isLiabilityAccountType(input.type)
        ? input.interestAllocationAccountId
        : undefined,
    loanTermMonths: isLiabilityAccountType(input.type) ? input.loanTermMonths : undefined,
  };
}

function normalizeStoredAccount(account: Account) {
  const supportsInterest = supportsInterestAccountType(account.type);
  return {
    ...normalizeAccountCurrency(account),
    annualInterestRate: supportsInterest ? account.annualInterestRate : undefined,
    interestFrequency: supportsInterest ? account.interestFrequency : undefined,
    interestStartedAt: supportsInterest ? account.interestStartedAt : undefined,
    interestAllocationAccountId:
      supportsInterest && !isLiabilityAccountType(account.type)
        ? account.interestAllocationAccountId
        : undefined,
    loanTermMonths: isLiabilityAccountType(account.type) ? account.loanTermMonths : undefined,
  };
}

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function currentPortfolioId(get: () => FinanceState) {
  return get().activePortfolioId;
}

function getRecurringEndsAt(startsAt: string, months?: number) {
  if (!months || months < 1) return undefined;
  return dayjs(startsAt).add(months - 1, "month").endOf("month").toISOString();
}

function canCreateRecurring(type: Transaction["type"]) {
  return type === "income" || type === "expense";
}

function ensureInterestCategories(state: FinanceState, portfolioId: string) {
  const required = [
    { name: INTEREST_INCOME_CATEGORY_NAME, type: "income" as const, color: "#5fd38a" },
    { name: INTEREST_EXPENSE_CATEGORY_NAME, type: "expense" as const, color: "#f07f86" },
  ];
  const additions = required
    .filter(
      (category) =>
        !state.categories.some(
          (candidate) =>
            candidate.portfolioId === portfolioId &&
            candidate.name === category.name &&
            candidate.type === category.type,
        ),
    )
    .map((category) => ({
      id: uid("cat"),
      portfolioId,
      ...category,
    }));

  return additions;
}

const obsoleteRecurringRuleIds = new Set(["rec-rent"]);

function isObsoleteSeedTransaction(transaction: Transaction) {
  return (
    transaction.id.startsWith("seed-salary-") ||
    transaction.id.startsWith("seed-expense-") ||
    transaction.id.startsWith("seed-savings-") ||
    transaction.recurringRuleId === "rec-rent"
  );
}

function sanitizeFinanceState(state: FinanceState) {
  const removedPortfolioIds = new Set(
    (Array.isArray(state.portfolios) ? state.portfolios : [])
      .filter((portfolio) => portfolio.id === seedPortfolioId && portfolio.deletedAt)
      .map((portfolio) => portfolio.id),
  );
  const portfolios = Array.isArray(state.portfolios)
    ? state.portfolios.filter((portfolio) => !removedPortfolioIds.has(portfolio.id))
    : state.portfolios;
  const transactions = Array.isArray(state.transactions)
    ? state.transactions.filter(
        (transaction) =>
          !isObsoleteSeedTransaction(transaction) &&
          !removedPortfolioIds.has(transaction.portfolioId),
      )
    : state.transactions;

  return {
    ...state,
    portfolios,
    activePortfolioId:
      state.activePortfolioId && !removedPortfolioIds.has(state.activePortfolioId)
        ? state.activePortfolioId
        : Array.isArray(portfolios)
          ? portfolios.find((portfolio) => !portfolio.deletedAt)?.id ?? ""
          : state.activePortfolioId,
    currencyDisplay: state.currencyDisplay ?? "native",
    accounts: Array.isArray(state.accounts)
      ? state.accounts
          .filter((account) => !removedPortfolioIds.has(account.portfolioId))
          .map((account) => normalizeStoredAccount(account))
      : state.accounts,
    categories: Array.isArray(state.categories)
      ? state.categories.filter((category) => !removedPortfolioIds.has(category.portfolioId))
      : state.categories,
    transactions,
    transactionItems: Array.isArray(state.transactionItems)
      ? state.transactionItems.filter((item) =>
          Array.isArray(transactions)
            ? transactions.some((transaction) => transaction.id === item.transactionId)
            : true,
        )
      : state.transactionItems,
    recurringRules: Array.isArray(state.recurringRules)
      ? state.recurringRules.filter((rule) => !obsoleteRecurringRuleIds.has(rule.id))
      : state.recurringRules,
  };
}

const financeStorageBaseKey = "finanko-supabase-state-v1";
const financePersistVersion = 6;
const financeSupabaseTable = "finance_snapshots";

function financeStorageKeyForUser(userId: string) {
  return `${financeStorageBaseKey}:${encodeURIComponent(userId)}`;
}

function isUntouchedStarterState(state: FinanceSnapshot) {
  return (
    state.portfolios.length === 1 &&
    state.portfolios[0]?.id === seedPortfolioId &&
    state.transactions.length === 0 &&
    state.transactionItems.length === 0 &&
    state.recurringRules.length === 0 &&
    state.accounts.every((account) => obsoleteSeedAccountIds.has(account.id)) &&
    state.categories.every((category) => seedCategoryIds.has(category.id))
  );
}

function prepareFinanceStateForUser(state: FinanceSnapshot, portfolioName: string) {
  return isUntouchedStarterState(state) ? createSeedSnapshot(portfolioName) : state;
}

function parsePersistedFinanceValue(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

async function writeFinanceStateToSupabase(userId: string, value: string) {
  const payload = parsePersistedFinanceValue(value);
  if (!payload) return false;

  const supabase = await getSupabaseClient();
  if (!supabase) return false;

  const { error } = await supabase.from(financeSupabaseTable).upsert(
    {
      user_id: userId,
      payload,
    },
    {
      onConflict: "user_id",
    },
  );

  if (error) {
    console.error("Supabase finance snapshot write failed", error);
    return false;
  }

  return true;
}

async function readFinanceStateFromSupabase(userId: string) {
  const supabase = await getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(financeSupabaseTable)
    .select("payload")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Supabase finance snapshot read failed", error);
    return null;
  }

  return data?.payload ? JSON.stringify(data.payload) : null;
}

async function deleteFinanceStateFromSupabase(userId: string) {
  const supabase = await getSupabaseClient();
  if (!supabase) return false;

  const { error } = await supabase.from(financeSupabaseTable).delete().eq("user_id", userId);
  if (error) {
    console.error("Supabase finance snapshot delete failed", error);
    return false;
  }

  return true;
}

function createFinanceSupabaseStateStorage(userId: string): StateStorage<Promise<void>> {
  return {
    getItem: async () => readFinanceStateFromSupabase(userId),
    setItem: async (_name, value) => {
      const saved = await writeFinanceStateToSupabase(userId, value);
      if (!saved) throw new Error("Supabase finance storage write failed");
    },
    removeItem: async () => {
      const deleted = await deleteFinanceStateFromSupabase(userId);
      if (!deleted) throw new Error("Supabase finance storage delete failed");
    },
  };
}

function createFinanceJsonStorage(storage: StateStorage<Promise<void>>): PersistStorage<Partial<FinanceState>> {
  const jsonStorage = createJSONStorage<Partial<FinanceState>, Promise<void>>(() => storage);
  if (!jsonStorage) {
    throw new Error("Finance JSON storage is unavailable");
  }
  return jsonStorage;
}

function createEmptyFinanceStateStorage(): StateStorage<Promise<void>> {
  return {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  };
}

function getFinanceStorageForUser(userId: string): PersistStorage<Partial<FinanceState>> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured");
  }
  return createFinanceJsonStorage(createFinanceSupabaseStateStorage(userId));
}

async function readStoredFinanceState(
  storage: PersistStorage<Partial<FinanceState>>,
  storageKey: string,
) {
  const persisted = await storage.getItem(storageKey);
  if (!persisted?.state) return null;
  return sanitizeFinanceState({
    ...createSeedSnapshot(),
    ...(persisted.state as Partial<FinanceState>),
  } as FinanceState);
}

export async function switchFinanceStorageScope(userId: string, portfolioName: string) {
  const storageKey = financeStorageKeyForUser(userId);
  const storage = getFinanceStorageForUser(userId);
  useFinanceStore.persist.setOptions({ name: storageKey, storage });

  const storedState = (await readStoredFinanceState(storage, storageKey)) ?? createSeedSnapshot(portfolioName);
  const userState = prepareFinanceStateForUser(storedState, portfolioName);
  useFinanceStore.setState(userState as Partial<FinanceState>);
}

export const useFinanceStore = create<FinanceState>()(
  persist<FinanceState, [], [], Partial<FinanceState>>(
    (set, get) => ({
      ...seedSnapshot,
      setActivePortfolio: (id) => set({ activePortfolioId: id }),
      setTimeframe: (timeframe) => set({ timeframe }),
      setTransactionFilter: (transactionFilter) => set({ transactionFilter }),
      setCurrencyDisplay: (currencyDisplay) => set({ currencyDisplay }),
      addPortfolio: (name, baseCurrency) => {
        const id = uid("portfolio");
        set((state) => ({
          portfolios: [...state.portfolios, { id, name, baseCurrency }],
          activePortfolioId: id,
          categories: [
            ...state.categories,
            ...defaultCategories.map((category) => ({
              ...category,
              id: uid("cat"),
              portfolioId: id,
            })),
          ],
        }));
      },
      deletePortfolio: (id) =>
        set((state) => {
          const portfolios = state.portfolios.map((portfolio) =>
            portfolio.id === id ? { ...portfolio, deletedAt: new Date().toISOString() } : portfolio,
          );
          const nextActive =
            portfolios.find((portfolio) => !portfolio.deletedAt && portfolio.id !== id)?.id ?? "";
          return { portfolios, activePortfolioId: nextActive };
        }),
      addAccount: (input) =>
        set((state) => ({
          accounts: [
            ...state.accounts,
            {
              id: uid("acc"),
              portfolioId: state.activePortfolioId,
              color: ["#4fb6e8", "#5fd38a", "#e8b94c", "#9b82e6"][
                state.accounts.length % 4
              ],
              ...normalizeAccountInput(input),
            },
          ],
        })),
      updateAccount: (id, input) =>
        set((state) => ({
          accounts: state.accounts.map((account) =>
            account.id === id
              ? {
                  ...account,
                  ...normalizeAccountInput(input),
                }
              : account,
          ),
        })),
      archiveAccount: (id) =>
        set((state) => ({
          accounts: state.accounts.map((account) =>
            account.id === id
              ? { ...account, isArchived: true, deletedAt: new Date().toISOString() }
              : account,
          ),
        })),
      repairAccountCurrencies: () =>
        set((state) => ({
          accounts: state.accounts.map((account) => normalizeStoredAccount(account)),
        })),
      addCategory: (input) =>
        set((state) => {
          if (!state.activePortfolioId) return state;
          return {
            categories: [
              ...state.categories,
              {
                id: uid("cat"),
                portfolioId: state.activePortfolioId,
                ...input,
              },
            ],
          };
        }),
      addTransaction: (input) => {
        const id = uid("tx");
        const activePortfolioId = currentPortfolioId(get);
        const isRecurring = Boolean(input.recurring && canCreateRecurring(input.type));
        const recurringRuleId = isRecurring ? uid("rec") : undefined;
        const transaction: Transaction = {
          id,
          portfolioId: activePortfolioId,
          accountId: input.accountId,
          type: input.type,
          amount: input.amount,
          currency: input.currency,
          categoryId: input.categoryId,
          linkedAccountId: input.linkedAccountId,
          principalAmount: input.principalAmount,
          interestAmount: input.interestAmount,
          description: input.description,
          occurredAt: input.occurredAt,
          source: isRecurring ? "recurring" : input.source ?? "manual",
          recurringRuleId,
        };
        const transactionItems =
          input.items?.map((item) => ({
            ...item,
            id: uid("item"),
            transactionId: id,
          })) ?? [];
        set((state) => ({
          transactions: [...state.transactions, transaction],
          transactionItems: [...(state.transactionItems ?? []), ...transactionItems],
          recurringRules: isRecurring
            ? [
                ...state.recurringRules,
                {
                  id: recurringRuleId!,
                  portfolioId: activePortfolioId,
                  accountId: input.accountId,
                  type: input.type === "income" ? "income" : "expense",
                  amount: input.amount,
                  currency: input.currency,
                  categoryId: input.categoryId,
                  description: input.description,
                  dayOfMonth: dayjs(input.occurredAt).date(),
                  startsAt: input.occurredAt,
                  endsAt: getRecurringEndsAt(input.occurredAt, input.recurringMonths),
                  isActive: true,
                },
              ]
            : state.recurringRules,
        }));
      },
      updateTransaction: (id, input) => {
        const transactionItems =
          input.items?.map((item) => ({
            ...item,
            id: uid("item"),
            transactionId: id,
          })) ?? [];
        set((state) => {
          const existing = state.transactions.find((transaction) => transaction.id === id);
          const isRecurring = Boolean(input.recurring && canCreateRecurring(input.type));
          const recurringRuleId = isRecurring
            ? existing?.recurringRuleId ?? uid("rec")
            : existing?.recurringRuleId;
          const hasRecurringRule = state.recurringRules.some((rule) => rule.id === recurringRuleId);

          return {
            transactions: state.transactions.map((transaction) =>
              transaction.id === id
                ? {
                    ...transaction,
                    accountId: input.accountId,
                    type: input.type,
                    amount: input.amount,
                    currency: input.currency,
                    categoryId: input.categoryId,
                    linkedAccountId: input.linkedAccountId,
                    principalAmount: input.principalAmount,
                    interestAmount: input.interestAmount,
                    description: input.description,
                    occurredAt: input.occurredAt,
                    source: isRecurring ? "recurring" : input.source ?? transaction.source,
                    recurringRuleId,
                  }
                : transaction,
            ),
            transactionItems: [
              ...(state.transactionItems ?? []).filter((item) => item.transactionId !== id),
              ...transactionItems,
            ],
            recurringRules:
              isRecurring && recurringRuleId && !hasRecurringRule
                ? [
                    ...state.recurringRules,
                    {
                      id: recurringRuleId,
                      portfolioId: currentPortfolioId(get),
                      accountId: input.accountId,
                      type: input.type === "income" ? "income" : "expense",
                      amount: input.amount,
                      currency: input.currency,
                      categoryId: input.categoryId,
                      description: input.description,
                      dayOfMonth: dayjs(input.occurredAt).date(),
                      startsAt: input.occurredAt,
                      endsAt: getRecurringEndsAt(input.occurredAt, input.recurringMonths),
                      isActive: true,
                    },
                  ]
                : state.recurringRules.map((rule) =>
                    rule.id === recurringRuleId
                      ? {
                          ...rule,
                          accountId: input.accountId,
                          type: input.type === "income" ? "income" : "expense",
                          amount: input.amount,
                          currency: input.currency,
                          categoryId: input.categoryId,
                          description: input.description,
                          dayOfMonth: dayjs(input.occurredAt).date(),
                          startsAt: input.occurredAt,
                          endsAt: getRecurringEndsAt(input.occurredAt, input.recurringMonths),
                          isActive: isRecurring,
                        }
                      : rule,
                  ),
          };
        });
      },
      deleteTransaction: (id) =>
        set((state) => ({
          transactions: state.transactions.map((transaction) =>
            transaction.id === id
              ? { ...transaction, deletedAt: new Date().toISOString() }
              : transaction,
          ),
        })),
      generateDueRecurring: () => {
        const state = get();
        const interestCategories = ensureInterestCategories(state, state.activePortfolioId);
        const categories = [...state.categories, ...interestCategories];
        const additions = getDueRecurringTransactions({
          rules: state.recurringRules,
          transactions: state.transactions,
          portfolioId: state.activePortfolioId,
          date: dayjs(),
          createId: () => uid("tx"),
        });
        const interestAdditions = getDueInterestAccrualTransactions({
          accounts: state.accounts,
          categories,
          transactions: [...state.transactions, ...additions],
          portfolioId: state.activePortfolioId,
          date: dayjs(),
          createId: () => uid("tx"),
        });

        if (additions.length > 0 || interestAdditions.length > 0 || interestCategories.length > 0) {
          set({
            categories,
            transactions: [...state.transactions, ...additions, ...interestAdditions],
          });
        }
      },
      resetFinanceData: () =>
        set((state) => {
          const portfolioName =
            state.portfolios.find((portfolio) => portfolio.id === state.activePortfolioId)?.name ??
            undefined;
          return createSeedSnapshot(portfolioName);
        }),
    }),
    {
      name: financeStorageBaseKey,
      storage: createFinanceJsonStorage(createEmptyFinanceStateStorage()),
      version: financePersistVersion,
      skipHydration: true,
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== "object") {
          return createSeedSnapshot();
        }
        return sanitizeFinanceState({
          ...createSeedSnapshot(),
          ...(persistedState as Partial<FinanceState>),
        } as FinanceState);
      },
      merge: (persistedState, currentState) => {
        if (!persistedState || typeof persistedState !== "object") return currentState;
        return sanitizeFinanceState({
          ...currentState,
          ...(persistedState as Partial<FinanceState>),
        } as FinanceState);
      },
    },
  ),
);
