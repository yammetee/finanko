import dayjs from "dayjs";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FinanceState } from "./financeTypes";
import { createSeedSnapshot, defaultCategories } from "./seedData";
import type { Account, Currency, Transaction } from "../../shared/types/finance";
import { getDueRecurringTransactions } from "../recurring/recurring";
import {
  isLiabilityAccountType,
  normalizeAccountInitialBalance,
} from "../../shared/lib/accounts";

const now = dayjs();
const seedSnapshot = createSeedSnapshot();

function inferAccountCurrency(account: Pick<Account, "name" | "type" | "currency" | "initialBalance">): Currency {
  if (/(?:₽|rub|ruble|rubles|руб|рубл)/i.test(account.name)) return "RUB";
  if (/(?:₾|gel|lari|лари)/i.test(account.name)) return "GEL";
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

export const useFinanceStore = create<FinanceState>()(
  persist(
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
              ...normalizeAccountCurrency(input),
              initialBalance: normalizeAccountInitialBalance(
                input.type,
                input.initialBalance,
              ),
              interestAllocationAccountId:
                isLiabilityAccountType(input.type)
                  ? undefined
                  : input.interestAllocationAccountId,
            },
          ],
        })),
      updateAccount: (id, input) =>
        set((state) => ({
          accounts: state.accounts.map((account) =>
            account.id === id
              ? {
                  ...account,
                  ...normalizeAccountCurrency(input),
                  initialBalance: normalizeAccountInitialBalance(
                    input.type,
                    input.initialBalance,
                  ),
                  interestAllocationAccountId:
                    isLiabilityAccountType(input.type)
                      ? undefined
                      : input.interestAllocationAccountId,
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
          accounts: state.accounts.map((account) => normalizeAccountCurrency(account)),
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
        const recurringRuleId = input.recurring ? uid("rec") : undefined;
        const transaction: Transaction = {
          id,
          portfolioId: activePortfolioId,
          accountId: input.accountId,
          type: input.type,
          amount: input.amount,
          currency: input.currency,
          categoryId: input.categoryId,
          description: input.description,
          occurredAt: input.occurredAt,
          source: input.recurring ? "recurring" : input.source ?? "manual",
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
          recurringRules: input.recurring
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
          const recurringRuleId = input.recurring
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
                    description: input.description,
                    occurredAt: input.occurredAt,
                    source: input.recurring ? "recurring" : input.source ?? transaction.source,
                    recurringRuleId,
                  }
                : transaction,
            ),
            transactionItems: [
              ...(state.transactionItems ?? []).filter((item) => item.transactionId !== id),
              ...transactionItems,
            ],
            recurringRules:
              input.recurring && recurringRuleId && !hasRecurringRule
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
                          isActive: Boolean(input.recurring),
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
        const additions = getDueRecurringTransactions({
          rules: state.recurringRules,
          transactions: state.transactions,
          portfolioId: state.activePortfolioId,
          date: now,
          createId: () => uid("tx"),
        });

        if (additions.length > 0) {
          set({ transactions: [...state.transactions, ...additions] });
        }
      },
      exportSnapshot: () => {
        const state = get();
        return {
          activePortfolioId: state.activePortfolioId,
          timeframe: state.timeframe,
          transactionFilter: state.transactionFilter,
          currencyDisplay: state.currencyDisplay,
          portfolios: state.portfolios,
          accounts: state.accounts,
          categories: state.categories,
          transactions: state.transactions,
        transactionItems: state.transactionItems ?? [],
        recurringRules: state.recurringRules,
      };
      },
      importSnapshot: (snapshot) => set(snapshot),
      resetDemoData: () => set(createSeedSnapshot()),
    }),
    {
      name: "finanko-local-state-v3",
      version: 4,
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== "object") return persistedState;
        const state = persistedState as FinanceState;
        return {
          ...state,
          currencyDisplay: state.currencyDisplay ?? "native",
          accounts: Array.isArray(state.accounts)
            ? state.accounts.map((account) => normalizeAccountCurrency(account))
            : state.accounts,
        };
      },
    },
  ),
);
