import { describe, expect, it } from "vitest";
import { parseReceiptMock, parseTextExpenseMock } from "./expenseParser";
import type { Category } from "../../shared/types/finance";

const categories: Category[] = [
  {
    id: "cat-food",
    portfolioId: "p1",
    name: "Food",
    type: "expense",
    color: "#fff",
  },
  {
    id: "cat-home",
    portfolioId: "p1",
    name: "Home",
    type: "expense",
    color: "#fff",
  },
];

describe("expense parser mocks", () => {
  it("parses text items and totals decimal values", () => {
    const parsed = parseTextExpenseMock({
      text: "coffee 5.5 groceries 40",
      currency: "USD",
      categories,
    });

    expect(parsed.items).toHaveLength(2);
    expect(parsed.total).toBe(45.5);
    expect(parsed.items[0].categoryId).toBe("cat-food");
  });

  it("returns a fallback item when text has no amount", () => {
    const parsed = parseTextExpenseMock({
      text: "lunch",
      currency: "USD",
      categories,
    });

    expect(parsed.items).toHaveLength(1);
    expect(parsed.total).toBe(42);
  });

  it("parses receipt mock with stable line items", () => {
    const parsed = parseReceiptMock({
      fileName: "receipt.jpg",
      currency: "USD",
      categories,
    });

    expect(parsed.description).toBe("Receipt: receipt.jpg");
    expect(parsed.items).toHaveLength(3);
    expect(parsed.total).toBe(55);
  });
});
