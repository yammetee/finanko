import dayjs from "dayjs";
import { afterEach, describe, expect, it } from "vitest";
import type { Category, Expense, ExpenseItem } from "../../shared/types/expense";
import { setLiveExchangeRates } from "../../shared/lib/currency";
import {
  buildExpenseTrendBuckets,
  buildExpenseView,
  calculateAverageDailyExpense,
  getExpenseTrackingStart,
  getExpensePeriodRange,
  UNALLOCATED_CATEGORY_KEY,
  type ExpenseFilters,
} from "./expenseAnalytics";

const categories: Category[] = [
  { id: "food", name: "Food", color: "#f00" },
  { id: "home", name: "Home", color: "#0f0" },
];

afterEach(() => setLiveExchangeRates(null));

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense",
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
  expenses: Expense[],
  items: ExpenseItem[] = [],
  categoryKeys: string[] = [],
) {
  return buildExpenseView({
    expenses,
    expenseItems: items,
    categories,
    filters: { period: "month", categoryKeys },
    displayCurrency: "USD",
    now: dayjs("2026-08-04T18:00:00.000Z"),
  });
}

describe("expense analytics", () => {
  it("uses the saved expense total when item arithmetic does not match", () => {
    const result = view([expense()], [
      { id: "item", expenseId: "expense", name: "Food", amount: 70, categoryId: "food", confidence: 1 },
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
        { id: "food-item", expenseId: "expense", name: "Food", amount: 60, categoryId: "food", confidence: 1 },
        { id: "home-item", expenseId: "expense", name: "Soap", amount: 30, categoryId: "home", confidence: 1 },
      ],
      ["home"],
    );

    expect(result.total).toBe(30);
    expect(result.history[0].contribution).toBe(30);
  });

  it("exposes the receipt difference through the unallocated filter", () => {
    const result = view(
      [expense()],
      [{ id: "item", expenseId: "expense", name: "Food", amount: 75, categoryId: "food", confidence: 1 }],
      [UNALLOCATED_CATEGORY_KEY],
    );

    expect(result.total).toBe(25);
  });

  it("keeps a negative receipt difference as an unallocated correction", () => {
    const result = view(
      [expense()],
      [{ id: "item", expenseId: "expense", name: "Food", amount: 125, categoryId: "food", confidence: 1 }],
      [UNALLOCATED_CATEGORY_KEY],
    );

    expect(result.total).toBe(-25);
    expect(result.byCategory[0]).toEqual(expect.objectContaining({ value: -25 }));
  });

  it("uses the main category for expenses without line items", () => {
    expect(view([expense()], [], ["food"]).total).toBe(100);
    expect(view([expense()], [], ["home"]).total).toBe(0);
  });

  it("filters deleted and out-of-period records", () => {
    const result = view([
      expense(),
      expense({ id: "deleted", deletedAt: "2026-08-05T00:00:00.000Z" }),
      expense({ id: "old", occurredAt: "2026-07-30T12:00:00.000Z" }),
    ]);

    expect(result.history.map((entry) => entry.expense.id)).toEqual(["expense"]);
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
    expect(result.history.map(({ expense: current, nativeContribution }) => [current.currency, nativeContribution]))
      .toEqual([["USD", 10], ["GEL", 20]]);
    expect(usdExpense).toEqual(expect.objectContaining({ amount: 10, currency: "USD" }));
    expect(gelExpense).toEqual(expect.objectContaining({ amount: 20, currency: "GEL" }));
  });

  it("keeps category totals separated in their source currencies", () => {
    setLiveExchangeRates({
      date: "2026-08-04",
      USD: 1,
      GEL: 2,
      RUB: 100,
      THB: 40,
    });
    const result = view([
      expense({ id: "usd", amount: 10, currency: "USD" }),
      expense({ id: "gel", amount: 20, currency: "GEL" }),
    ]);

    expect(result.total).toBe(20);
    expect(result.nativeByCategory).toEqual([
      expect.objectContaining({ key: "food", currency: "USD", value: 10, convertedValue: 10 }),
      expect.objectContaining({ key: "food", currency: "GEL", value: 20, convertedValue: 10 }),
    ]);
  });

  it("uses the converted USD total for averages and trend buckets", () => {
    setLiveExchangeRates({
      date: "2026-08-04",
      USD: 1,
      GEL: 2,
      RUB: 100,
      THB: 40,
    });
    const result = view([
      expense({ id: "usd", amount: 10, currency: "USD" }),
      expense({ id: "gel", amount: 20, currency: "GEL" }),
    ]);
    const filters: ExpenseFilters = { period: "today", categoryKeys: [] };

    expect(calculateAverageDailyExpense(
      result.history,
      filters,
      result.total,
      dayjs("2026-08-04T18:00:00.000Z"),
    )).toBe(20);
    const buckets = buildExpenseTrendBuckets(
      result.history,
      filters,
      dayjs("2026-08-04T18:00:00.000Z"),
    );
    expect(buckets[buckets.length - 1]?.value).toBe(20);
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

  it("builds cumulative points for the compact spending graph", () => {
    const result = view([
      expense({ id: "first", amount: 30, occurredAt: "2026-08-01T12:00:00.000Z" }),
      expense({ id: "second", amount: 70, occurredAt: "2026-08-04T12:00:00.000Z" }),
    ]);
    const buckets = buildExpenseTrendBuckets(
      result.history,
      { period: "month", categoryKeys: [] },
      dayjs("2026-08-04T18:00:00.000Z"),
    );

    expect(buckets).toHaveLength(31);
    expect(buckets.slice(0, 4).map((bucket) => bucket.value)).toEqual([30, 30, 30, 100]);
    expect(buckets[buckets.length - 1].value).toBe(result.total);
  });

  it("keeps week graphs on seven daily points", () => {
    const buckets = buildExpenseTrendBuckets(
      [{ expense: expense(), contribution: 100 }],
      { period: "week", categoryKeys: [] },
      dayjs("2026-08-04T18:00:00.000Z"),
    );

    expect(buckets).toHaveLength(7);
    expect(buckets.every((bucket) => bucket.unit === "day")).toBe(true);
  });

  it("calculates daily average using elapsed days in the current period", () => {
    const result = view([
      expense({ id: "first", amount: 100, occurredAt: "2026-08-01T12:00:00.000Z" }),
      expense({ id: "second", amount: 40, occurredAt: "2026-08-04T12:00:00.000Z" }),
    ]);

    expect(calculateAverageDailyExpense(
      result.history,
      { period: "month", categoryKeys: [] },
      result.total,
      dayjs("2026-08-07T18:00:00.000Z"),
    )).toBe(20);
  });

  it("calculates daily average across a completed custom range", () => {
    const history = [{ expense: expense(), contribution: 100 }];

    expect(calculateAverageDailyExpense(
      history,
      {
        period: "custom",
        categoryKeys: [],
        customRange: ["2026-08-01T00:00:00.000Z", "2026-08-10T00:00:00.000Z"],
      },
      100,
      dayjs("2026-08-20T18:00:00.000Z"),
    )).toBe(10);
  });

  it("calculates all-time daily average from the first expense through today", () => {
    const history = [
      {
        expense: expense({ occurredAt: "2026-08-03T12:00:00.000Z" }),
        contribution: 100,
      },
    ];

    expect(calculateAverageDailyExpense(
      history,
      { period: "all", categoryKeys: [] },
      100,
      dayjs("2026-08-07T18:00:00.000Z"),
    )).toBe(20);
  });

  it("starts an unfinished year average when expense tracking actually began", () => {
    const history = [
      {
        expense: expense({ occurredAt: "2026-08-04T12:00:00.000Z" }),
        contribution: 100,
      },
    ];

    expect(calculateAverageDailyExpense(
      history,
      { period: "year", categoryKeys: [] },
      100,
      dayjs("2026-08-07T18:00:00.000Z"),
      "2026-07-01T12:00:00.000Z",
    )).toBeCloseTo(100 / 38);
  });

  it("finds the first persisted expense without using deleted rows", () => {
    expect(getExpenseTrackingStart([
      expense({ id: "current", occurredAt: "2026-07-01T12:00:00.000Z" }),
      expense({ id: "older-deleted", occurredAt: "2025-01-01T12:00:00.000Z", deletedAt: "2026-01-01T00:00:00.000Z" }),
    ])).toBe("2026-07-01T12:00:00.000Z");
  });
});
