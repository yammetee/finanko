import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import {
  calculateExpenseItemsTotal,
  createEmptyExpenseDraft,
  expenseFormToInput,
  type ExpenseDraft,
  type ExpenseFormValues,
} from "./expenseDraft";

describe("expense draft persistence", () => {
  it("calculates the editable item total once for display and persistence", () => {
    expect(calculateExpenseItemsTotal([
      { amount: 40 },
      { amount: 50 },
      { amount: 100 },
    ])).toBe(190);
  });

  it("creates a manual draft with an editable item instead of aggregate fields", () => {
    expect(createEmptyExpenseDraft("GEL", "food")).toMatchObject({
      currency: "GEL",
      items: [{ name: "", categoryId: "food", confidence: 1 }],
    });
  });

  it("saves manually entered items through the shared item path", () => {
    const values: ExpenseFormValues = {
      currency: "GEL",
      occurredAt: dayjs("2026-08-04T12:00:00.000Z"),
      source: "manual",
      items: [{ name: "  Исправленный расход  ", amount: 125, categoryId: "food", confidence: 1 }],
    };
    const input = expenseFormToInput(values);

    expect(input.amount).toBe(125);
    expect(input.description).toBe("Исправленный расход");
    expect(expenseFormToInput({ ...values, currency: "USD" }).amount).toBe(125);
  });

  it("derives aggregate fields from manually or automatically created items", () => {
    const input = expenseFormToInput({
      currency: "GEL",
      occurredAt: dayjs("2026-08-04T12:00:00.000Z"),
      source: "text_ai",
      items: [
        { name: "Кофе", amount: 5, categoryId: "food", confidence: 0.9 },
        { name: "Продукты", amount: 40, categoryId: "home", confidence: 0.8 },
      ],
    });

    expect(input).toMatchObject({
      amount: 45,
      currency: "GEL",
      categoryId: "food",
      description: "Кофе, Продукты",
      items: [
        { amount: 5, categoryId: "food" },
        { amount: 40, categoryId: "home" },
      ],
    });
  });

  it("treats analyzer review warnings as informational", () => {
    const values: ExpenseFormValues & Pick<ExpenseDraft, "receiptReview"> = {
      currency: "THB",
      occurredAt: dayjs("2026-08-04T12:00:00.000Z"),
      source: "receipt_ai",
      items: [
        { name: "Coffee", amount: 43, categoryId: "food", confidence: 0.2 },
      ],
      receiptReview: {
        confidence: 0.2,
        requiresReview: true,
        warnings: ["low_confidence", "arithmetic_mismatch"],
        rawRows: ["Coffee 43"],
        totals: { subtotal: 43, total: 48 },
      },
    };

    expect(expenseFormToInput(values)).toMatchObject({
      amount: 43,
      description: "Coffee",
      items: [{ amount: 43 }],
    });
  });
});
