import dayjs from "dayjs";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FinanceState } from "./financeTypes";
import { createSeedSnapshot, defaultCategories } from "./seedData";
import type { Transaction } from "../../shared/types/finance";
import { getDueRecurringTransactions } from "../recurring/recurring";

const now = dayjs();
const seedSnapshot = createSeedSnapshot();

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function currentPortfolioId(get: () => FinanceState) {
  return get().activePortfolioId;
}

export const useFinanceStore = create<FinanceState>()(
  persist(
    (set, get) => ({
      ...seedSnapshot,
      setActivePortfolio: (id) => set({ activePortfolioId: id }),
      setTimeframe: (timeframe) => set({ timeframe }),
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
            portfolios.find((portfolio) => !portfolio.deletedAt && portfolio.id !== id)?.id ?? id;
          return { portfolios, activePortfolioId: nextActive };
        }),
      addAccount: (input) =>
        set((state) => ({
          accounts: [
            ...state.accounts,
            {
              id: uid("acc"),
              portfolioId: state.activePortfolioId,
              color: ["#7dd3fc", "#86efac", "#fbbf24", "#c4b5fd"][
                state.accounts.length % 4
              ],
              ...input,
            },
          ],
        })),
      archiveAccount: (id) =>
        set((state) => ({
          accounts: state.accounts.map((account) =>
            account.id === id
              ? { ...account, isArchived: true, deletedAt: new Date().toISOString() }
              : account,
          ),
        })),
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
                  isActive: true,
                },
              ]
            : state.recurringRules,
        }));
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
    }),
    { name: "finanko-local-state-v3" },
  ),
);
