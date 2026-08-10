import { create } from "zustand";
import { uid } from "../../shared/lib/id";
import dayjs from "dayjs";
import type { Expense } from "../../shared/types/expense";
import { createDefaultCategories } from "./categoryData";
import { expenseRangeKey, loadExpenseData, loadExpenses, loadExpenseTrackingStart, saveCategories, saveExpenses } from "./expenseRepository";
import type { ExpenseRange, ExpenseState, NewExpenseInput } from "./expenseTypes";

let expenseSessionVersion = 0;
let expenseRangeRequestVersion = 0;

export function initialExpenseRange(): ExpenseRange {
  return { start: dayjs().startOf("month").toISOString(), end: dayjs().endOf("month").toISOString() };
}

export async function initializeExpenseData(ownerId: string) {
  const version = ++expenseSessionVersion;
  expenseRangeRequestVersion += 1;
  const range = initialExpenseRange();
  useExpenseStore.setState({ ownerId, categories: [], expenses: [], trackingStartedAt: undefined, loadedRangeKey: null, rangeLoading: false, loadState: "loading" });
  try {
    let snapshot = await loadExpenseData(range);
    const existingNames = new Set(
      snapshot.categories.map((category) => category.name.trim().toLocaleLowerCase()),
    );
    const missingDefaults = createDefaultCategories().filter(
      (category) => !existingNames.has(category.name.toLocaleLowerCase()),
    );
    if (missingDefaults.length > 0) {
      await saveCategories(missingDefaults, ownerId);
      snapshot = {
        ...snapshot,
        categories: [...snapshot.categories, ...missingDefaults],
      };
    }
    if (version === expenseSessionVersion && useExpenseStore.getState().ownerId === ownerId) {
      useExpenseStore.setState({ ...snapshot, loadedRangeKey: expenseRangeKey(range), loadState: "ready" });
      void loadExpenseTrackingStart().then((trackingStartedAt) => {
        if (version === expenseSessionVersion && useExpenseStore.getState().ownerId === ownerId) {
          useExpenseStore.setState({ trackingStartedAt });
        }
      }).catch(() => undefined);
    }
  } catch (error) {
    if (version === expenseSessionVersion && useExpenseStore.getState().ownerId === ownerId) {
      useExpenseStore.setState({ loadState: "error" });
    }
    throw error;
  }
}

export function resetExpenseData() {
  expenseSessionVersion += 1;
  expenseRangeRequestVersion += 1;
  useExpenseStore.setState({ ownerId: null, categories: [], expenses: [], trackingStartedAt: undefined, loadedRangeKey: null, rangeLoading: false, loadState: "idle" });
}

function buildExpense(input: NewExpenseInput, existing?: Expense): Expense {
  return {
    id: existing?.id ?? uid("expense"),
    amount: input.amount,
    currency: input.currency,
    categoryId: input.categoryId,
    description: input.description,
    occurredAt: input.occurredAt,
    source: input.source ?? existing?.source ?? "manual",
  };
}

export const useExpenseStore = create<ExpenseState>()((set, get) => ({
  ownerId: null,
  categories: [],
  expenses: [],
  trackingStartedAt: undefined,
  loadedRangeKey: null,
  rangeLoading: false,
  loadState: "idle",
  loadRange: async (range) => {
    const ownerId = get().ownerId;
    const key = expenseRangeKey(range);
    if (!ownerId || get().loadedRangeKey === key) return;
    const sessionVersion = expenseSessionVersion;
    const requestVersion = ++expenseRangeRequestVersion;
    set({ rangeLoading: true });
    try {
      const expenses = await loadExpenses(range);
      if (sessionVersion === expenseSessionVersion && requestVersion === expenseRangeRequestVersion && get().ownerId === ownerId) set({ expenses, loadedRangeKey: key, rangeLoading: false });
    } catch (error) {
      if (sessionVersion === expenseSessionVersion && requestVersion === expenseRangeRequestVersion && get().ownerId === ownerId) set({ rangeLoading: false });
      throw error;
    }
  },
  addExpenses: async (inputs) => {
    const expenses = inputs.map((input) => buildExpense(input));
    await saveExpenses(expenses);
    set((current) => ({
      expenses: [...current.expenses, ...expenses],
      trackingStartedAt: [current.trackingStartedAt, ...expenses.map((expense) => expense.occurredAt)]
        .filter((value): value is string => Boolean(value))
        .sort()[0],
    }));
  },
  updateExpense: async (id, input) => {
    const existing = get().expenses.find((expense) => expense.id === id);
    if (!existing) throw new Error("Expense not found");
    const updated = buildExpense(input, existing);
    await saveExpenses([updated]);
    const trackingStartedAt = await loadExpenseTrackingStart().catch(() => get().trackingStartedAt);
    set((current) => ({
      expenses: current.expenses.map((expense) =>
        expense.id === id ? updated : expense,
      ),
      trackingStartedAt,
    }));
  },
  deleteExpense: async (id) => {
    const state = get();
    const existing = state.expenses.find((expense) => expense.id === id);
    if (!existing) throw new Error("Expense not found");
    const deleted = { ...existing, deletedAt: new Date().toISOString() };
    await saveExpenses([deleted]);
    const trackingStartedAt = await loadExpenseTrackingStart().catch(() => get().trackingStartedAt);
    set((current) => ({
      expenses: current.expenses.filter((expense) => expense.id !== id),
      trackingStartedAt,
    }));
  },
}));
