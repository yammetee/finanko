import { describe, expect, it } from "vitest";
import { deriveReceiptTotal } from "./receiptRecovery";

describe("deriveReceiptTotal", () => {
  it("recovers the Thai 7-Eleven payable total without treating cash or change as total", () => {
    expect(deriveReceiptTotal({
      rows: [
        ...[58, 79, 66, 19, 39, 10, 55, 20, 40, 30, 20].map((amount) => ({ rowType: "product" as const, amount })),
        { rowType: "subtotal", amount: 436 },
        { rowType: "discount", amount: 5 },
        { rowType: "discount", amount: 7 },
        { rowType: "discount", amount: 4 },
        { rowType: "total", amount: 420 },
        { rowType: "payment", amount: 1000 },
        { rowType: "change", amount: 580 },
      ],
      totals: { subtotal: 436, discount: 16, tax: null, total: null },
    })).toBe(420);
  });

  it("falls back to item arithmetic when printed totals are unreadable", () => {
    expect(deriveReceiptTotal({
      rows: [
        { rowType: "product", amount: 100 },
        { rowType: "product", amount: 50 },
        { rowType: "discount", amount: 10 },
      ],
      totals: { subtotal: null, discount: null, tax: null, total: null },
    })).toBe(140);
  });
});
