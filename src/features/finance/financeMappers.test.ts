import { describe, expect, it } from "vitest";
import {
  mapAccountRow,
  mapPortfolioRow,
  mapRecurringRuleRow,
  mapTransactionRow,
} from "./financeMappers";

describe("finance mappers", () => {
  it("maps portfolio rows to domain portfolios", () => {
    expect(
      mapPortfolioRow({
        id: "p1",
        user_id: "u1",
        name: "Personal",
        base_currency: "USD",
        deleted_at: null,
      }),
    ).toEqual({
      id: "p1",
      name: "Personal",
      baseCurrency: "USD",
      deletedAt: undefined,
    });
  });

  it("maps numeric database strings to account numbers", () => {
    expect(
      mapAccountRow({
        id: "a1",
        portfolio_id: "p1",
        name: "Bank",
        type: "bank",
        currency: "USD",
        initial_balance: "42.50",
        color: "#fff",
        is_archived: false,
        deleted_at: null,
      }).initialBalance,
    ).toBe(42.5);
  });

  it("maps transaction rows to domain transactions", () => {
    const transaction = mapTransactionRow({
      id: "t1",
      portfolio_id: "p1",
      account_id: "a1",
      type: "expense",
      amount: "12.30",
      currency: "USD",
      category_id: null,
      description: "Coffee",
      occurred_at: "2026-07-07T00:00:00.000Z",
      source: "manual",
      recurring_rule_id: null,
      deleted_at: null,
    });

    expect(transaction.amount).toBe(12.3);
    expect(transaction.categoryId).toBe("");
    expect(transaction.occurredAt).toBe("2026-07-07T00:00:00.000Z");
  });

  it("maps recurring rules to domain rules", () => {
    expect(
      mapRecurringRuleRow({
        id: "r1",
        portfolio_id: "p1",
        account_id: "a1",
        type: "expense",
        amount: "100",
        currency: "USD",
        category_id: "c1",
        description: "Rent",
        day_of_month: 31,
        starts_at: "2026-01-01T00:00:00.000Z",
        is_active: true,
      }).dayOfMonth,
    ).toBe(31);
  });
});
