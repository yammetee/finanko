import dayjs from "dayjs";
import { afterEach, describe, expect, it } from "vitest";
import { setLiveExchangeRates } from "../../shared/lib/currency";
import {
  calculateExpenseItemsTotal,
  createEmptyExpenseDraft,
  expenseFormToInputs,
  type ExpenseDraft,
  type ExpenseFormValues,
} from "./expenseDraft";

describe("expense draft persistence", () => {
  afterEach(() => setLiveExchangeRates(null));

  it("converts each independent item only for the displayed total", () => {
    setLiveExchangeRates({ date: "2026-08-04", USD: 1, GEL: 2, RUB: 100, THB: 40 });
    expect(calculateExpenseItemsTotal([
      { amount: 10, currency: "USD" },
      { amount: 20, currency: "GEL" },
    ], "USD", "2026-08-04T12:00:00.000Z")).toBe(20);
  });

  it("creates a manual draft with an editable item instead of aggregate fields", () => {
    expect(createEmptyExpenseDraft("GEL", "food")).toMatchObject({
      currency: "GEL",
      items: [{ name: "", currency: "GEL", categoryId: "food" }],
    });
  });

  it("saves manually entered items through the shared item path", () => {
    const values: ExpenseFormValues = {
      currency: "GEL",
      occurredAt: dayjs("2026-08-04T12:00:00.000Z"),
      source: "manual",
      items: [{ name: "  Исправленный расход  ", amount: 125, currency: "GEL", categoryId: "food" }],
    };
    const [input] = expenseFormToInputs(values);

    expect(input.amount).toBe(125);
    expect(input.currency).toBe("GEL");
    expect(input.description).toBe("Исправленный расход");
  });

  it("turns every draft item into an independent expense", () => {
    const inputs = expenseFormToInputs({
      currency: "USD",
      occurredAt: dayjs("2026-08-04T12:00:00.000Z"),
      source: "text_ai",
      items: [
        { name: "Кофе", amount: 5, currency: "USD", categoryId: "food" },
        { name: "Продукты", amount: 40, currency: "GEL", categoryId: "home" },
      ],
    });

    expect(inputs).toEqual([
      expect.objectContaining({ amount: 5, currency: "USD", categoryId: "food", description: "Кофе" }),
      expect.objectContaining({ amount: 40, currency: "GEL", categoryId: "home", description: "Продукты" }),
    ]);
  });

  it("treats analyzer review warnings as informational", () => {
    const values: ExpenseFormValues & Pick<ExpenseDraft, "receiptReview"> = {
      currency: "THB",
      occurredAt: dayjs("2026-08-04T12:00:00.000Z"),
      source: "receipt_ai",
      items: [
        { name: "Coffee", amount: 43, currency: "THB", categoryId: "food" },
      ],
      receiptReview: {
        confidence: 0.2,
        requiresReview: true,
        warnings: ["low_confidence", "arithmetic_mismatch"],
        rawRows: ["Coffee 43"],
        totals: { subtotal: 43, total: 48 },
      },
    };

    expect(expenseFormToInputs(values)).toEqual([
      expect.objectContaining({ amount: 43, currency: "THB", description: "Coffee" }),
    ]);
  });
});
