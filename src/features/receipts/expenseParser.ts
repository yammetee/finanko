import type {
  AccountType,
  Category,
  Currency,
  InterestFrequency,
} from "../../shared/types/finance";

export interface ParsedExpenseItem {
  name: string;
  amount: number;
  categoryId: string;
  confidence: number;
}

export interface ParsedExpense {
  kind: "transaction";
  description: string;
  currency: Currency;
  items: ParsedExpenseItem[];
  total: number;
}

export interface ParsedAccount {
  kind: "account";
  name: string;
  type: AccountType;
  currency: Currency;
  initialBalance: number;
  annualInterestRate?: number;
  interestFrequency?: InterestFrequency;
  loanTermMonths?: number;
}

export type ParsedTextInput = ParsedExpense | ParsedAccount;

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

export function detectCurrencyInText(text: string): Currency | null {
  if (/(?:₽|rub|ruble|rubles|руб|рубл|р\b)/i.test(text)) return "RUB";
  if (/(?:₾|gel|lari|лари)/i.test(text)) return "GEL";
  if (/(?:฿|thb|baht|бат)/i.test(text)) return "THB";
  if (/(?:\$|usd|dollar|dollars|доллар)/i.test(text)) return "USD";
  return null;
}

export function detectAmountInText(text: string) {
  const match = text.match(/(\d[\d\s.,]*)/);
  if (!match) return null;
  const amount = Number(match[1].replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(amount) ? amount : null;
}

function findCategoryId(categories: Category[], fallbackName: string) {
  return (
    categories.find((category) =>
      category.name.toLowerCase().includes(fallbackName.toLowerCase()),
    )?.id ?? categories[0]?.id ?? ""
  );
}

function parseExpenseText({
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
    kind: "transaction",
    description: text,
    currency,
    items,
    total: items.reduce((sum, item) => sum + item.amount, 0),
  };
}

export function parseTextExpenseMock(input: ParseTextExpenseInput): ParsedExpense {
  return parseExpenseText(input);
}

export function parseTextInputMock(input: ParseTextExpenseInput): ParsedTextInput {
  const { text, currency } = input;
  const creditMatch = text.match(/(?:кредит|ипотек|loan|credit|mortgage)/i);
  if (!creditMatch) return parseExpenseText(input);

  const rateMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:%|процент|percent)/i);
  const yearsMatch = text.match(/(\d+)\s*(?:год|года|лет|year|years)/i);

  return {
    kind: "account",
    name: /сбер|sber/i.test(text) ? "Кредит Сбербанк" : "Кредит",
    type: /ипотек|mortgage/i.test(text) ? "mortgage" : "credit",
    currency: detectCurrencyInText(text) ?? currency,
    initialBalance: detectAmountInText(text) ?? 0,
    annualInterestRate: rateMatch ? Number(rateMatch[1].replace(",", ".")) : undefined,
    interestFrequency: "daily",
    loanTermMonths: yearsMatch ? Number(yearsMatch[1]) * 12 : undefined,
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
    kind: "transaction",
    description: `Receipt: ${fileName}`,
    currency,
    items,
    total: items.reduce((sum, item) => sum + item.amount, 0),
  };
}
