import type { Category, Currency } from "../../shared/types/finance";

export interface ParsedExpenseItem {
  name: string;
  amount: number;
  categoryId: string;
  confidence: number;
}

export interface ParsedExpense {
  description: string;
  currency: Currency;
  items: ParsedExpenseItem[];
  total: number;
}

export interface ParseTextExpenseInput {
  text: string;
  currency: Currency;
  categories: Category[];
}

export interface ParseReceiptInput {
  fileName: string;
  currency: Currency;
  categories: Category[];
}

function findCategoryId(categories: Category[], fallbackName: string) {
  return (
    categories.find((category) =>
      category.name.toLowerCase().includes(fallbackName.toLowerCase()),
    )?.id ?? categories[0]?.id ?? ""
  );
}

export function parseTextExpenseMock({
  text,
  currency,
  categories,
}: ParseTextExpenseInput): ParsedExpense {
  const categoryId = findCategoryId(categories, "food");
  const matches = Array.from(text.matchAll(/([\p{L}\s]+?)\s+(\d+(?:[.,]\d+)?)/gu));
  const items =
    matches.length > 0
      ? matches.map((match) => ({
          name: match[1].trim(),
          amount: Number(match[2].replace(",", ".")),
          categoryId,
          confidence: 0.72,
        }))
      : [
          {
            name: text.trim() || "Parsed expense",
            amount: 42,
            categoryId,
            confidence: 0.4,
          },
        ];

  return {
    description: text,
    currency,
    items,
    total: items.reduce((sum, item) => sum + item.amount, 0),
  };
}

export function parseReceiptMock({
  fileName,
  currency,
  categories,
}: ParseReceiptInput): ParsedExpense {
  const foodCategory = findCategoryId(categories, "food");
  const homeCategory = findCategoryId(categories, "home");
  const items = [
    { name: "Groceries", amount: 32, categoryId: foodCategory, confidence: 0.78 },
    { name: "Drinks", amount: 9, categoryId: foodCategory, confidence: 0.7 },
    { name: "Household", amount: 14, categoryId: homeCategory, confidence: 0.64 },
  ];

  return {
    description: `Receipt: ${fileName}`,
    currency,
    items,
    total: items.reduce((sum, item) => sum + item.amount, 0),
  };
}
