import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Category } from "../../shared/types/finance";
import type { FinanceSnapshot } from "./financeTypes";

const repository = vi.hoisted(() => ({
  insertPortfolio: vi.fn(),
  loadFinanceData: vi.fn(),
  saveAccount: vi.fn(),
  saveCategories: vi.fn(),
  saveTransaction: vi.fn(),
}));

vi.mock("./financeRepository", () => repository);

import { initializeFinanceData, useFinanceStore } from "./financeStore";

const snapshot: FinanceSnapshot = {
  activePortfolioId: "portfolio",
  portfolios: [{ id: "portfolio", name: "Hidden", baseCurrency: "USD" }],
  accounts: [{
    id: "account",
    portfolioId: "portfolio",
    name: "Hidden",
    type: "custom",
    currency: "USD",
    initialBalance: 0,
    color: "#000",
  }],
  categories: [{
    id: "food",
    portfolioId: "portfolio",
    name: "Food",
    type: "expense",
    color: "#f00",
  }],
  transactions: [{
    id: "expense",
    portfolioId: "portfolio",
    accountId: "account",
    type: "expense",
    amount: 40,
    currency: "USD",
    categoryId: "food",
    linkedAccountId: "legacy-linked-account",
    principalAmount: 7,
    interestAmount: 3,
    description: "Old value",
    occurredAt: "2026-08-01T12:00:00.000Z",
    source: "recurring",
    recurringRuleId: "legacy-rule",
  }],
  transactionItems: [{
    id: "existing-item",
    transactionId: "expense",
    name: "Coffee",
    amount: 40,
    categoryId: "food",
    confidence: 0.8,
  }],
};

describe("expense persistence store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFinanceStore.setState(snapshot);
  });

  it("updates edited values while preserving real row and item identities", async () => {
    await useFinanceStore.getState().updateTransaction("expense", {
      amount: 55,
      currency: "USD",
      categoryId: "food",
      description: "Edited value",
      occurredAt: "2026-08-02T12:00:00.000Z",
      items: [{
        id: "existing-item",
        name: "Coffee",
        amount: 50,
        categoryId: "food",
        confidence: 0.8,
      }],
    });

    const saved = repository.saveTransaction.mock.calls[0][0];
    expect(saved).toMatchObject({
      id: "expense",
      portfolioId: "portfolio",
      accountId: "account",
      amount: 55,
      source: "recurring",
      linkedAccountId: "legacy-linked-account",
      recurringRuleId: "legacy-rule",
    });
    expect(repository.saveTransaction.mock.calls[0][1][0].id).toBe("existing-item");
    expect(useFinanceStore.getState().transactionItems[0].id).toBe("existing-item");
  });

  it("soft-deletes an expense without removing its row or receipt items", async () => {
    await useFinanceStore.getState().deleteTransaction("expense");

    const saved = repository.saveTransaction.mock.calls[0][0];
    expect(saved.id).toBe("expense");
    expect(saved.deletedAt).toEqual(expect.any(String));
    expect(repository.saveTransaction.mock.calls[0][1]).toEqual(snapshot.transactionItems);
    expect(useFinanceStore.getState().transactions).toHaveLength(1);
    expect(useFinanceStore.getState().transactionItems).toEqual(snapshot.transactionItems);
  });

  it("assigns hidden compatibility relations when adding an expense", async () => {
    await useFinanceStore.getState().addTransaction({
      amount: 10,
      currency: "USD",
      categoryId: "food",
      description: "New expense",
      occurredAt: "2026-08-04T12:00:00.000Z",
    });

    expect(repository.saveTransaction.mock.calls[0][0]).toMatchObject({
      portfolioId: "portfolio",
      accountId: "account",
      type: "expense",
      amount: 10,
    });
  });

  it("does not change the in-memory expense when the database write fails", async () => {
    repository.saveTransaction.mockRejectedValueOnce(new Error("offline"));

    await expect(useFinanceStore.getState().updateTransaction("expense", {
      amount: 99,
      currency: "USD",
      categoryId: "food",
      description: "Must not appear locally",
      occurredAt: "2026-08-04T12:00:00.000Z",
      items: [],
    })).rejects.toThrow("offline");

    expect(useFinanceStore.getState().transactions[0]).toMatchObject({
      amount: 40,
      description: "Old value",
    });
  });

  it("adds only missing fixed categories without changing existing expenses", async () => {
    repository.loadFinanceData.mockResolvedValueOnce(snapshot);

    await initializeFinanceData("owner", "Personal");

    const savedCategories = repository.saveCategories.mock.calls[0][0] as Category[];
    expect(savedCategories.map((category) => category.name)).toEqual([
      "Home",
      "Transport",
      "Health",
      "Shopping",
      "Entertainment",
      "Bills",
      "Travel",
      "Subscriptions",
      "Education",
      "Other",
    ]);
    expect(useFinanceStore.getState().categories).toHaveLength(11);
    expect(useFinanceStore.getState().transactions).toEqual(snapshot.transactions);
    expect(useFinanceStore.getState().transactionItems).toEqual(snapshot.transactionItems);
  });
});
