import { create } from "zustand";
import type { Expense, ExpenseItem } from "../../shared/types/expense";
import { createDefaultCategories } from "./categoryData";
import { loadExpenseData, saveCategories, saveExpense } from "./expenseRepository";
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

function buildExpense(input: NewExpenseInput, existing?: Expense) {
  const expense: Expense = {
    id: existing?.id ?? uid("expense"),
    amount: input.amount,
    currency: input.currency,
    categoryId: input.categoryId,
    description: input.description,
    occurredAt: input.occurredAt,
    source: input.source ?? existing?.source ?? "manual",
  };
  const items: ExpenseItem[] = (input.items ?? []).map((item) => ({
    ...item,
    id: item.id ?? uid("item"),
    expenseId: expense.id,
  }));
  return { expense, items };
}

export const useExpenseStore = create<ExpenseState>()((set, get) => ({
  categories: [],
  expenses: [],
  expenseItems: [],
  addExpense: async (input) => {
    const built = buildExpense(input);
    await saveExpense(built.expense, built.items);
    set((current) => ({
      expenses: [...current.expenses, built.expense],
      expenseItems: [...current.expenseItems, ...built.items],
    }));
  },
  updateExpense: async (id, input) => {
    const existing = get().expenses.find((expense) => expense.id === id);
    if (!existing) throw new Error("Expense not found");
    const built = buildExpense(input, existing);
    await saveExpense(built.expense, built.items);
    set((current) => ({
      expenses: current.expenses.map((expense) =>
        expense.id === id ? built.expense : expense,
      ),
      expenseItems: [
        ...current.expenseItems.filter((item) => item.expenseId !== id),
        ...built.items,
      ],
    }));
  },
  deleteExpense: async (id) => {
    const state = get();
    const existing = state.expenses.find((expense) => expense.id === id);
    if (!existing) throw new Error("Expense not found");
    const deleted = { ...existing, deletedAt: new Date().toISOString() };
    await saveExpense(
      deleted,
      state.expenseItems.filter((item) => item.expenseId === id),
    );
    set((current) => ({
      expenses: current.expenses.filter((expense) => expense.id !== id),
      expenseItems: current.expenseItems.filter((item) => item.expenseId !== id),
    }));
  },
}));
