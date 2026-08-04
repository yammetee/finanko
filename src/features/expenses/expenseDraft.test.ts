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
      source: "text_ai",
      items: [
        { id: "existing-item", name: "Кофе", amount: 90, categoryId: "food", confidence: 0.7 },
      ],
    });

    expect(input.amount).toBe(125);
    expect(input.description).toBe("Исправленный расход");
    expect(input.items?.[0].id).toBe("existing-item");
    expect(input.items?.[0].amount).toBe(90);
  });

  it("does not require item arithmetic to match the saved total", () => {
    expect(() => expenseFormToInput({
      amount: 100,
      currency: "USD",
      categoryId: "food",
      occurredAt: dayjs("2026-08-04T12:00:00.000Z"),
      source: "receipt_ai",
      items: [
        { name: "Food", amount: 73, categoryId: "food", confidence: 0.6 },
      ],
    })).not.toThrow();
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
      amount: 48,
      description: "Edited after review",
      items: [{ amount: 43 }],
    });
  });
});
