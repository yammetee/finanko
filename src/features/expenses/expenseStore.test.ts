import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Category } from "../../shared/types/expense";
import type { ExpenseSnapshot } from "./expenseTypes";

const repository = vi.hoisted(() => ({
  loadExpenseData: vi.fn(),
  saveCategories: vi.fn(),
  saveExpense: vi.fn(),
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
  expenseItems: [{
    id: "existing-item",
    expenseId: "expense",
    name: "Original item",
    amount: 100,
    categoryId: "food",
    confidence: 0.8,
  }],
};

describe("expense store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useExpenseStore.setState(snapshot);
  });

  it("persists edited values and preserves existing item IDs", async () => {
    await useExpenseStore.getState().updateExpense("expense", {
      amount: 125,
      currency: "GEL",
      categoryId: "food",
      description: "Edited",
      occurredAt: "2026-08-05T12:00:00.000Z",
      source: "receipt_ai",
      items: [{
        id: "existing-item",
        name: "Edited item",
        amount: 90,
        categoryId: "food",
        confidence: 0.9,
      }],
    });

    expect(repository.saveExpense).toHaveBeenCalledWith(
      expect.objectContaining({ id: "expense", amount: 125, description: "Edited" }),
      [expect.objectContaining({ id: "existing-item", expenseId: "expense", amount: 90 })],
    );
    expect(useExpenseStore.getState().expenseItems[0].id).toBe("existing-item");
  });

  it("soft-deletes in Postgres and removes the expense from the active cache", async () => {
    await useExpenseStore.getState().deleteExpense("expense");

    expect(repository.saveExpense.mock.calls[0][0].deletedAt).toEqual(expect.any(String));
    expect(useExpenseStore.getState().expenses).toEqual([]);
    expect(useExpenseStore.getState().expenseItems).toEqual([]);
  });

  it("does not mutate the cache when persistence fails", async () => {
    repository.saveExpense.mockRejectedValueOnce(new Error("offline"));

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
      .mockResolvedValueOnce({ categories: [], expenses: [], expenseItems: [] })
      .mockResolvedValueOnce({ categories: completeCategories, expenses: [], expenseItems: [] });

    await initializeExpenseData("user-id");

    expect(repository.saveCategories).toHaveBeenCalledWith(expect.any(Array), "user-id");
    expect(useExpenseStore.getState().categories).toEqual(completeCategories);
  });
});
