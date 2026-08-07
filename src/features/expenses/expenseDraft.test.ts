import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import {
  expenseFormToInput,
  type ExpenseDraft,
  type ExpenseFormValues,
} from "./expenseDraft";

describe("expense draft persistence", () => {
  it("saves edited draft values instead of analyzer output", () => {
    const input = expenseFormToInput({
      amount: 125,
      currency: "GEL",
      categoryId: "food",
      description: "  Исправленный расход  ",
      occurredAt: dayjs("2026-08-04T12:00:00.000Z"),
      source: "manual",
    });

    expect(input.amount).toBe(125);
    expect(input.description).toBe("Исправленный расход");
  });

  it("derives aggregate fields from recognized items", () => {
    const input = expenseFormToInput({
      amount: 999,
      currency: "GEL",
      categoryId: "other",
      description: "duplicate summary",
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
      items: [{ amount: 5 }, { amount: 40 }],
    });
  });

  it("treats analyzer review warnings as informational", () => {
    const values: ExpenseFormValues & Pick<ExpenseDraft, "receiptReview"> = {
      amount: 48,
      currency: "THB",
      categoryId: "food",
      description: "Edited after review",
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
