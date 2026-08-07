import { create } from "zustand";
import type { Expense } from "../../shared/types/expense";
import { createDefaultCategories } from "./categoryData";
import { loadExpenseData, saveCategories, saveExpenses } from "./expenseRepository";
import type { ExpenseState, NewExpenseInput } from "./expenseTypes";

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export async function initializeExpenseData(ownerId: string) {
  let snapshot = await loadExpenseData();
  const existingNames = new Set(
    snapshot.categories.map((category) => category.name.trim().toLocaleLowerCase()),
  );
  const missingDefaults = createDefaultCategories().filter(
    (category) => !existingNames.has(category.name.toLocaleLowerCase()),
  );
  if (missingDefaults.length > 0) {
    await saveCategories(missingDefaults, ownerId);
    snapshot = await loadExpenseData();
  }
  useExpenseStore.setState(snapshot);
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
  categories: [],
  expenses: [],
  addExpenses: async (inputs) => {
    const expenses = inputs.map((input) => buildExpense(input));
    await saveExpenses(expenses);
    set((current) => ({
      expenses: [...current.expenses, ...expenses],
    }));
  },
  updateExpense: async (id, input) => {
    const existing = get().expenses.find((expense) => expense.id === id);
    if (!existing) throw new Error("Expense not found");
    const updated = buildExpense(input, existing);
    await saveExpenses([updated]);
    set((current) => ({
      expenses: current.expenses.map((expense) =>
        expense.id === id ? updated : expense,
      ),
    }));
  },
  deleteExpense: async (id) => {
    const state = get();
    const existing = state.expenses.find((expense) => expense.id === id);
    if (!existing) throw new Error("Expense not found");
    const deleted = { ...existing, deletedAt: new Date().toISOString() };
    await saveExpenses([deleted]);
    set((current) => ({
      expenses: current.expenses.filter((expense) => expense.id !== id),
    }));
  },
}));
