import { describe, expect, it } from "vitest";
import type { Account, Category, Transaction, TransactionItem } from "../../shared/types/finance";
import { buildAssistantSummary } from "./assistantSummary";

const portfolioId = "portfolio";
const accounts: Account[] = [
  { id: "cash", portfolioId, name: "Cash", type: "bank", currency: "USD", initialBalance: 1000, color: "#fff" },
  { id: "debt", portfolioId, name: "Debt", type: "credit", currency: "USD", initialBalance: -500, annualInterestRate: 20, interestFrequency: "monthly", color: "#fff" },
];
const categories: Category[] = [
  { id: "food", portfolioId, name: "Food", type: "expense", color: "#f00" },
  { id: "other", portfolioId, name: "Other", type: "expense", color: "#aaa" },
  { id: "salary", portfolioId, name: "Salary", type: "income", color: "#0f0" },
];
const transactions: Transaction[] = [
  { id: "income", portfolioId, accountId: "cash", type: "income", amount: 200, currency: "USD", categoryId: "salary", description: "Salary", occurredAt: new Date().toISOString(), source: "recurring" },
  { id: "expense", portfolioId, accountId: "cash", type: "expense", amount: 100, currency: "USD", categoryId: "other", description: "Receipt", occurredAt: new Date().toISOString(), source: "recurring" },
];
const items: TransactionItem[] = [
  { id: "food-item", transactionId: "expense", name: "Food", amount: 30, categoryId: "food", confidence: 1 },
  { id: "other-item", transactionId: "expense", name: "Other", amount: 70, categoryId: "other", confidence: 1 },
];

describe("assistant financial summary", () => {
  it("uses receipt items for categories and separates recurring income from expenses", () => {
    const summary = buildAssistantSummary(accounts, categories, transactions, "month", "USD", items);
    expect(summary.topCategories.map(({ id, amount }) => ({ id, amount }))).toEqual([
      { id: "other", amount: 70 },
      { id: "food", amount: 30 },
    ]);
    expect(summary.recurringIncome).toBe(200);
    expect(summary.recurringExpenses).toBe(100);
    expect(summary.savingsRatePercent).toBe(50);
    expect(summary.totalAssets).toBe(1100);
    expect(summary.totalLiabilities).toBe(500);
    expect(summary.dataQuality).toMatchObject({
      canProject: false,
      isSparse: true,
      observedDays: 1,
    });
  });

  it("marks a short history as insufficient for projections", () => {
    const summary = buildAssistantSummary(accounts, categories, transactions, "month", "USD", items);
    expect(summary.dataQuality.canProject).toBe(false);
    expect(summary.accounts.map(({ name }) => name)).toEqual(["Cash", "Debt"]);
  });
});
