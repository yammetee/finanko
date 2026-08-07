import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Category } from "../../shared/types/expense";
import type { ExpenseSnapshot } from "./expenseTypes";

const repository = vi.hoisted(() => ({
  loadExpenseData: vi.fn(),
  saveCategories: vi.fn(),
  saveExpenses: vi.fn(),
}));

vi.mock("./expenseRepository", () => repository);

import { initializeExpenseData, useExpenseStore } from "./expenseStore";

const snapshot: ExpenseSnapshot = {
  categories: [{ id: "food", name: "Food", color: "#f00" }],
  expenses: [{
    id: "expense",
    amount: 100,
    currency: "USD",
    categoryId: "food",
    description: "Original",
    occurredAt: "2026-08-04T12:00:00.000Z",
    source: "receipt_ai",
  }],
};

describe("expense store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useExpenseStore.setState(snapshot);
  });

  it("persists edited independent expenses", async () => {
    await useExpenseStore.getState().updateExpense("expense", {
      amount: 125,
      currency: "GEL",
      categoryId: "food",
      description: "Edited",
      occurredAt: "2026-08-05T12:00:00.000Z",
      source: "receipt_ai",
    });

    expect(repository.saveExpenses).toHaveBeenCalledWith([
      expect.objectContaining({ id: "expense", amount: 125, description: "Edited" }),
    ]);
  });

  it("saves a receipt draft as separate expense entities in one batch", async () => {
    await useExpenseStore.getState().addExpenses([
      { amount: 10, currency: "USD", categoryId: "food", description: "Coffee", occurredAt: "2026-08-05T12:00:00.000Z", source: "receipt_ai" },
      { amount: 20, currency: "GEL", categoryId: "food", description: "Bread", occurredAt: "2026-08-05T12:00:00.000Z", source: "receipt_ai" },
    ]);

    expect(repository.saveExpenses).toHaveBeenCalledWith([
      expect.objectContaining({ amount: 10, currency: "USD", description: "Coffee" }),
      expect.objectContaining({ amount: 20, currency: "GEL", description: "Bread" }),
    ]);
    expect(useExpenseStore.getState().expenses).toHaveLength(3);
  });

  it("soft-deletes in Postgres and removes the expense from the active cache", async () => {
    await useExpenseStore.getState().deleteExpense("expense");

    expect(repository.saveExpenses.mock.calls[0][0][0].deletedAt).toEqual(expect.any(String));
    expect(useExpenseStore.getState().expenses).toEqual([]);
  });

  it("does not mutate the cache when persistence fails", async () => {
    repository.saveExpenses.mockRejectedValueOnce(new Error("offline"));

    await expect(useExpenseStore.getState().updateExpense("expense", {
      amount: 50,
      currency: "USD",
      categoryId: "food",
      description: "Failed",
      occurredAt: "2026-08-05T12:00:00.000Z",
    })).rejects.toThrow("offline");

    expect(useExpenseStore.getState().expenses[0].description).toBe("Original");
  });

  it("creates missing default categories and reloads canonical rows", async () => {
    const completeCategories = Array.from({ length: 11 }, (_, index): Category => ({
      id: `category-${index}`,
      name: index === 0 ? "Food" : `Category ${index}`,
      color: "#000",
    }));
    repository.loadExpenseData
      .mockResolvedValueOnce({ categories: [], expenses: [] })
      .mockResolvedValueOnce({ categories: completeCategories, expenses: [] });

    await initializeExpenseData("user-id");

    expect(repository.saveCategories).toHaveBeenCalledWith(expect.any(Array), "user-id");
    expect(useExpenseStore.getState().categories).toEqual(completeCategories);
  });
});
