import dayjs from "dayjs";
import { afterEach, describe, expect, it } from "vitest";
import type { Category, Transaction, TransactionItem } from "../../shared/types/finance";
import { setLiveExchangeRates } from "../../shared/lib/currency";
import {
  buildExpenseBaseline,
  buildExpenseView,
  getExpensePeriodRange,
  UNALLOCATED_CATEGORY_KEY,
} from "./expenseAnalytics";

const categories: Category[] = [
  { id: "food", portfolioId: "portfolio", name: "Food", type: "expense", color: "#f00" },
  { id: "home", portfolioId: "portfolio", name: "Home", type: "expense", color: "#0f0" },
];

afterEach(() => setLiveExchangeRates(null));

function expense(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "expense",
    portfolioId: "portfolio",
    accountId: "account",
    type: "expense",
    amount: 100,
    currency: "USD",
    categoryId: "food",
    description: "Groceries",
    occurredAt: "2026-08-04T12:00:00.000Z",
    source: "manual",
    ...overrides,
  };
}

function view(
  transactions: Transaction[],
  items: TransactionItem[] = [],
  categoryKeys: string[] = [],
) {
  return buildExpenseView({
    transactions,
    transactionItems: items,
    categories,
    portfolioIds: ["portfolio"],
    filters: { period: "month", categoryKeys },
    displayCurrency: "USD",
    now: dayjs("2026-08-04T18:00:00.000Z"),
  });
}

describe("expense analytics", () => {
  it("uses the saved expense total when item arithmetic does not match", () => {
    const result = view([expense()], [
      { id: "item", transactionId: "expense", name: "Food", amount: 70, categoryId: "food", confidence: 1 },
    ]);

    expect(result.total).toBe(100);
    expect(result.byCategory).toEqual([
      expect.objectContaining({ key: "food", value: 70 }),
      expect.objectContaining({ key: UNALLOCATED_CATEGORY_KEY, value: 30 }),
    ]);
  });

  it("filters a mixed receipt by item category without blocking on its total", () => {
    const result = view(
      [expense()],
      [
        { id: "food-item", transactionId: "expense", name: "Food", amount: 60, categoryId: "food", confidence: 1 },
        { id: "home-item", transactionId: "expense", name: "Soap", amount: 30, categoryId: "home", confidence: 1 },
      ],
      ["home"],
    );

    expect(result.total).toBe(30);
    expect(result.history[0].contribution).toBe(30);
  });

  it("exposes the receipt difference through the unallocated filter", () => {
    const result = view(
      [expense()],
      [{ id: "item", transactionId: "expense", name: "Food", amount: 75, categoryId: "food", confidence: 1 }],
      [UNALLOCATED_CATEGORY_KEY],
    );

    expect(result.total).toBe(25);
  });

  it("keeps a negative receipt difference as an unallocated correction", () => {
    const result = view(
      [expense()],
      [{ id: "item", transactionId: "expense", name: "Food", amount: 125, categoryId: "food", confidence: 1 }],
      [UNALLOCATED_CATEGORY_KEY],
    );

    expect(result.total).toBe(-25);
    expect(result.byCategory[0]).toEqual(expect.objectContaining({ value: -25 }));
  });

  it("uses the main category for expenses without line items", () => {
    expect(view([expense()], [], ["food"]).total).toBe(100);
    expect(view([expense()], [], ["home"]).total).toBe(0);
  });

  it("filters deleted, non-expense, foreign-portfolio, and out-of-period records", () => {
    const result = view([
      expense(),
      expense({ id: "deleted", deletedAt: "2026-08-05T00:00:00.000Z" }),
      expense({ id: "income", type: "income" }),
      expense({ id: "foreign", portfolioId: "foreign" }),
      expense({ id: "old", occurredAt: "2026-07-30T12:00:00.000Z" }),
    ]);

    expect(result.history.map((entry) => entry.transaction.id)).toEqual(["expense"]);
  });

  it("combines multiple selected categories into one total and matching history", () => {
    const result = view([
      expense({ id: "food-expense", amount: 40, categoryId: "food" }),
      expense({ id: "home-expense", amount: 60, categoryId: "home" }),
    ], [], ["food", "home"]);

    expect(result.total).toBe(100);
    expect(result.history.reduce((sum, entry) => sum + entry.contribution, 0)).toBe(result.total);
  });

  it("converts multi-currency expenses into the display currency without changing source values", () => {
    setLiveExchangeRates({
      date: "2026-08-04",
      USD: 1,
      GEL: 2,
      RUB: 100,
      THB: 40,
    });
    const usdExpense = expense({ id: "usd", amount: 10, currency: "USD" });
    const gelExpense = expense({ id: "gel", amount: 20, currency: "GEL" });

    const result = view([usdExpense, gelExpense]);

    expect(result.total).toBe(20);
    expect(usdExpense).toEqual(expect.objectContaining({ amount: 10, currency: "USD" }));
    expect(gelExpense).toEqual(expect.objectContaining({ amount: 20, currency: "GEL" }));
  });

  it("uses local calendar boundaries for every period preset", () => {
    const now = dayjs("2026-08-04T18:00:00.000Z");

    expect(getExpensePeriodRange({ period: "today" }, now)?.start.format("YYYY-MM-DD HH:mm"))
      .toBe("2026-08-04 00:00");
    expect(getExpensePeriodRange({ period: "week" }, now)?.start.format("YYYY-MM-DD"))
      .toBe("2026-08-03");
    expect(getExpensePeriodRange({ period: "month" }, now)?.start.format("YYYY-MM-DD"))
      .toBe("2026-08-01");
    expect(getExpensePeriodRange({ period: "year" }, now)?.start.format("YYYY-MM-DD"))
      .toBe("2026-01-01");
    expect(getExpensePeriodRange({ period: "all" }, now)).toBeNull();
    expect(getExpensePeriodRange({
      period: "custom",
      customRange: ["2026-07-02T14:00:00.000Z", "2026-07-08T14:00:00.000Z"],
    }, now)?.end.format("YYYY-MM-DD HH:mm"))
      .toBe("2026-07-08 23:59");
  });

  it("builds a stable read-only baseline", () => {
    const result = buildExpenseBaseline({
      transactions: [expense(), expense({ id: "gel", amount: 12, currency: "GEL" })],
      transactionItems: [
        { id: "item", transactionId: "expense", name: "Food", amount: 100, categoryId: "food", confidence: 1 },
      ],
    });

    expect(result.expenseCount).toBe(2);
    expect(result.itemCount).toBe(1);
    expect(result.totalsByCurrency).toEqual({ USD: 100, GEL: 12 });
    expect(result.countsByCategoryId).toEqual({ food: 2 });
    expect(result.expenseIds).toEqual(["expense", "gel"]);
  });
});
