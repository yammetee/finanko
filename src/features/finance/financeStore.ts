import dayjs from "dayjs";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
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

const financeStorageBaseKey = "finanko-local-state-v3";
const financePersistVersion = 6;

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

function clearBrowserFinanceStorage(storageKey: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey);
  window.localStorage.removeItem(financeStorageBaseKey);

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(`${financeStorageBaseKey}:`)) {
      window.localStorage.removeItem(key);
    }
  }
}

function readBrowserFinanceStorage(storageKey: string) {
  if (typeof window === "undefined") return null;
  const exactState =
    window.localStorage.getItem(storageKey) ?? window.localStorage.getItem(financeStorageBaseKey);
  if (exactState) return exactState;

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(`${financeStorageBaseKey}:`)) {
      const value = window.localStorage.getItem(key);
      if (value) return value;
    }
  }

  return null;
}

function createFinanceFileStateStorage(): StateStorage<Promise<void>> {
  return {
    getItem: async (name) => {
      const response = await fetch(`/api/local-db/finance/${encodeURIComponent(name)}`);
      if (response.ok) {
        const payload = (await response.json()) as { value?: unknown };
        return typeof payload.value === "string" ? payload.value : null;
      }
      if (response.status !== 404) {
        throw new Error("Local finance database is unavailable");
      }

      const browserState = readBrowserFinanceStorage(name);
      if (!browserState) return null;

      await fetch(`/api/local-db/finance/${encodeURIComponent(name)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: browserState }),
      });
      clearBrowserFinanceStorage(name);
      return browserState;
    },
    setItem: async (name, value) => {
      const response = await fetch(`/api/local-db/finance/${encodeURIComponent(name)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!response.ok) throw new Error("Local finance database write failed");
    },
    removeItem: async (name) => {
      const response = await fetch(`/api/local-db/finance/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Local finance database delete failed");
    },
  };
}

const financeFileStorage = createJSONStorage<Partial<FinanceState>, Promise<void>>(
  createFinanceFileStateStorage,
);

async function readFileFinanceState(storageKey: string) {
  const persisted = await financeFileStorage?.getItem(storageKey);
  if (!persisted?.state) return null;
  return sanitizeFinanceState({
    ...createSeedSnapshot(),
    ...(persisted.state as Partial<FinanceState>),
  } as FinanceState);
}

export async function switchFinanceStorageScope(userId: string, portfolioName: string) {
  const storageKey = financeStorageKeyForUser(userId);
  useFinanceStore.persist.setOptions({ name: storageKey, storage: financeFileStorage });

  const storedState = (await readFileFinanceState(storageKey)) ?? createSeedSnapshot(portfolioName);
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
      resetLocalData: () =>
        set((state) => {
          const portfolioName =
            state.portfolios.find((portfolio) => portfolio.id === state.activePortfolioId)?.name ??
            undefined;
          return createSeedSnapshot(portfolioName);
        }),
    }),
    {
      name: financeStorageBaseKey,
      storage: financeFileStorage,
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
