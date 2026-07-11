import type {
  AccountType,
  Category,
  Currency,
  InterestFrequency,
} from "../../shared/types/finance";

export interface ParsedExpenseItem {
  name: string;
  amount: number;
  quantity?: number;
  unitPrice?: number;
  categoryId: string;
  confidence: number;
}

export interface ParsedExpense {
  kind: "transaction";
  type?: "income" | "expense";
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
  fileType?: string;
  fileDataUrl?: string;
  text?: string;
  currency: Currency;
  categories: Category[];
}

export function detectCurrencyInText(text: string): Currency | null {
  if (/(?:₽|rub|ruble|rubles|руб|рубл|р\b)/i.test(text)) return "RUB";
  if (/(?:₾|gel|lari|lar|лар(?:и|а|ов)?|грузинск(?:ий|их|ие|ими)?\s+лар|ლარ(?:ი)?)/i.test(text)) return "GEL";
  if (/(?:฿|thb|baht|бат(?:ы|ов|а)?|тайск(?:ий|их|ие|ими)?\s+бат|บาท|ไทย)/i.test(text)) return "THB";
  if (/(?:cp\s*all|7-eleven|all\s*cafe)/i.test(text)) return "THB";
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

function resolveCategoryId(categories: Category[], value: unknown, fallbackName: string) {
  const rawValue = cleanText(value).toLowerCase();
  if (!rawValue) return findCategoryId(categories, fallbackName);

  return (
    categories.find((category) => category.id.toLowerCase() === rawValue)?.id ??
    categories.find((category) => category.name.toLowerCase() === rawValue)?.id ??
    categories.find((category) => category.name.toLowerCase().includes(rawValue))?.id ??
    categories.find((category) => rawValue.includes(category.name.toLowerCase()))?.id ??
    findCategoryId(categories, fallbackName)
  );
}

function findCategoryIdByType(categories: Category[], type: Category["type"], fallbackName: string) {
  return (
    categories.find(
      (category) =>
        category.type === type &&
        category.name.toLowerCase().includes(fallbackName.toLowerCase()),
    )?.id ??
    categories.find((category) => category.type === type)?.id ??
    categories[0]?.id ??
    ""
  );
}

function isCurrency(value: unknown): value is Currency {
  return value === "USD" || value === "RUB" || value === "GEL" || value === "THB";
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonZeroFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isReceiptInput(input: ParseReceiptInput | ParseTextExpenseInput): input is ParseReceiptInput {
  return "fileName" in input;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundQuantity(value: number) {
  return Math.round(value * 1000) / 1000;
}

function nearlyEqual(left: number, right: number) {
  return Math.abs(left - right) <= 0.01;
}

const thaiTextPattern = /[\u0E00-\u0E7F]/;
const cyrillicTextPattern = /[А-Яа-яЁё]/;

function containsThaiText(value: string) {
  return thaiTextPattern.test(value);
}

function isDiscountName(name: string) {
  return /(?:all\s*cafe|discount|coupon|promo|скид|купон|ส่วนลด|ลด|ფასდაკ)/i.test(name);
}

function isDiscountLikeItem(item: ParsedExpenseItem) {
  return isDiscountName(item.name);
}

function getRussianDescriptionNames(description: unknown) {
  const text = cleanText(description).replace(/^покупки\s*:\s*/i, "");
  if (!cyrillicTextPattern.test(text) || containsThaiText(text)) return [];
  return text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

const russianItemNameFallbacks: Array<[RegExp, string]> = [
  [/\b(grocer|food|snack|meal)\b/i, "Продукты"],
  [/\b(drink|water|coffee|tea|juice|cola|beer)\b/i, "Напитки"],
  [/\b(household|clean|soap|paper|tissue)\b/i, "Товары для дома"],
  [/\b(milk)\b/i, "Молоко"],
  [/\b(bread)\b/i, "Хлеб"],
  [/\b(egg)\b/i, "Яйца"],
  [/\b(rice)\b/i, "Рис"],
  [/\b(chicken)\b/i, "Курица"],
  [/\b(sandwich)\b/i, "Сэндвич"],
  [/\b(burger)\b/i, "Бургер"],
  [/\b(noodle|ramen)\b/i, "Лапша"],
  [/\b(ice\s*cream)\b/i, "Мороженое"],
  [/\b(yogurt|yoghurt)\b/i, "Йогурт"],
  [/\b(chocolate)\b/i, "Шоколад"],
  [/\b(cookie|biscuit)\b/i, "Печенье"],
  [/\b(chips|crisps)\b/i, "Чипсы"],
  [/\b(sausage)\b/i, "Колбаса"],
  [/\b(salad)\b/i, "Салат"],
  [/\b(cake)\b/i, "Торт"],
];

function normalizeItemName(name: string) {
  const cleaned = name
    .replace(/\((?:[^)]*(?:похоже|примерно|вероятно|возможно|не\s*распознано|unclear|unknown)[^)]*)\)/gi, "")
    .replace(/(?:^|[\s/.,;:()-])(?:около|примерно|похоже|вероятно|возможно)\.?/gi, " ")
    .replace(/(?:^|[\s/.,;:()-])(?:не\s*распознано|unknown|unclear|other|другое)(?=$|[\s/.,;:()-])/gi, " ")
    .replace(/(?:^|[\s/.,;:()-])(?:товар|продукт|позиция)(?=$|[\s/.,;:()-])/gi, " ")
    .replace(/^[\s/.,;:-]+|[\s/.,;:-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/(?:discount|coupon|promo|скид|купон|ส่วนลด|ลด)/i.test(cleaned)) return cleaned;
  const fallback = russianItemNameFallbacks.find(([pattern]) => pattern.test(cleaned));
  return fallback?.[1] ?? cleaned;
}

function buildReceiptDescription(input: ParseReceiptInput | ParseTextExpenseInput, items: ParsedExpenseItem[]) {
  const itemNames = Array.from(new Set(items.map((item) => item.name).filter(Boolean))).slice(0, 6);
  if (itemNames.length > 0) return itemNames.join(", ");

  if ("fileName" in input) return `Чек: ${input.fileName}`;
  return input.text || "Расход";
}

export function normalizeParsedExpense(
  input: ParseReceiptInput | ParseTextExpenseInput,
  parsed: unknown,
): ParsedExpense | null {
  if (!parsed || typeof parsed !== "object") return null;

  const payload = parsed as {
    kind?: unknown;
    description?: unknown;
    currency?: unknown;
    type?: unknown;
    items?: unknown;
    total?: unknown;
  };
  if (payload.kind !== "transaction") return null;

  const categoryId = findCategoryId(input.categories, "food");
  const russianDescriptionNames = getRussianDescriptionNames(payload.description);
  const items = Array.isArray(payload.items)
    ? payload.items
        .map((item, index): ParsedExpenseItem | null => {
          if (!item || typeof item !== "object") return null;
          const rawItem = item as {
            name?: unknown;
            amount?: unknown;
            quantity?: unknown;
            unitPrice?: unknown;
            categoryId?: unknown;
            confidence?: unknown;
          };
          if (!isNonZeroFiniteNumber(rawItem.amount)) return null;
          const rawName = cleanText(rawItem.name);
          let quantity = isPositiveFiniteNumber(rawItem.quantity)
            ? roundMoney(rawItem.quantity)
            : undefined;
          let unitPrice = isNonZeroFiniteNumber(rawItem.unitPrice)
            ? roundMoney(rawItem.unitPrice)
            : quantity
              ? roundMoney(rawItem.amount / quantity)
              : undefined;
          const rawAmount = roundMoney(rawItem.amount < 0 && !isDiscountName(rawName) ? Math.abs(rawItem.amount) : rawItem.amount);
          if (unitPrice && unitPrice < 0 && !isDiscountName(rawName)) unitPrice = Math.abs(unitPrice);
          let amount = rawAmount;
          const computedAmount = quantity && unitPrice ? roundMoney(quantity * unitPrice) : undefined;
          if (quantity && quantity >= 10 && unitPrice && Math.abs(unitPrice) < 1 && computedAmount !== undefined && nearlyEqual(rawAmount, computedAmount)) {
            quantity = roundQuantity(quantity / 1000);
            unitPrice = roundMoney(unitPrice * 1000);
          }
          if (
            quantity &&
            quantity > 1 &&
            unitPrice &&
            Math.abs(rawAmount) > Math.abs(unitPrice) * 1.5 &&
            (!computedAmount || !nearlyEqual(rawAmount, computedAmount))
          ) {
            amount = unitPrice;
            unitPrice = roundMoney(unitPrice / quantity);
          } else if (
            computedAmount !== undefined &&
            !nearlyEqual(rawAmount, computedAmount) &&
            Math.abs(rawAmount) > Math.abs(computedAmount) * 1.5
          ) {
            amount = computedAmount;
          }
          const normalizedName = normalizeItemName(rawName || russianDescriptionNames[index] || "");
          const translatedName =
            /all\s*cafe/i.test(normalizedName)
              ? "All Cafe"
              : containsThaiText(rawName) || (!cyrillicTextPattern.test(rawName) && Boolean(russianDescriptionNames[index]))
              ? russianDescriptionNames[index] ?? normalizedName
              : normalizedName;
          return {
            name: translatedName,
            amount,
            quantity,
            unitPrice,
            categoryId: resolveCategoryId(input.categories, rawItem.categoryId, "food"),
            confidence:
              typeof rawItem.confidence === "number" && Number.isFinite(rawItem.confidence)
                ? Math.max(0, Math.min(1, rawItem.confidence))
                : 0.55,
          };
        })
        .filter((item): item is ParsedExpenseItem => Boolean(item))
    : [];

  const explicitText =
    "text" in input && typeof input.text === "string" ? input.text : "";
  const searchableText = [
    explicitText,
    cleanText(payload.description),
    ...items.map((item) => item.name),
  ].join(" ");
  const detectedTotal = explicitText ? detectAmountInText(explicitText) : null;
  const payloadTotal = isPositiveFiniteNumber(payload.total) ? roundMoney(payload.total) : null;
  let payloadTotalIsSubtotal = false;
  if (isReceiptInput(input) && items.length >= 3 && payloadTotal !== null) {
    const discountIndices = items
      .map((item, index) => (item.amount > 0 && isDiscountLikeItem(item) ? index : -1))
      .filter((index) => index >= 0);

    discountIndices.forEach((index) => {
      const discount = items[index];
      items[index] = {
        ...discount,
        amount: -Math.abs(discount.amount),
        unitPrice: discount.unitPrice === undefined ? undefined : -Math.abs(discount.unitPrice),
      };
    });

    const positiveItemsTotal = roundMoney(items.reduce((sum, item) => sum + Math.max(0, item.amount), 0));
    payloadTotalIsSubtotal = discountIndices.length > 0 && nearlyEqual(payloadTotal, positiveItemsTotal);
  }
  const rawItemsTotal = roundMoney(items.reduce((sum, item) => sum + item.amount, 0));
  if (isReceiptInput(input) && items.length > 0 && payloadTotal !== null && !payloadTotalIsSubtotal) {
    const adjustment = roundMoney(payloadTotal - rawItemsTotal);
    const plausibleAdjustmentLimit = Math.max(20, Math.abs(rawItemsTotal) * 0.5);
    if (adjustment !== 0 && Math.abs(adjustment) <= plausibleAdjustmentLimit) {
      items.push({
        name: adjustment < 0 ? "Скидка/корректировка" : "Корректировка итога",
        amount: adjustment,
        quantity: 1,
        unitPrice: adjustment,
        categoryId,
        confidence: 0.5,
      });
    }
  }
  const itemsTotal = roundMoney(items.reduce((sum, item) => sum + item.amount, 0));
  const total = itemsTotal !== 0 ? itemsTotal : payloadTotal ?? detectedTotal;

  if (!isPositiveFiniteNumber(total)) return null;
  if (isReceiptInput(input) && items.length === 0) return null;

  const normalizedItems =
    items.length > 0
      ? items
      : [
          {
            name: "Итого по чеку",
            amount: total,
            quantity: 1,
            unitPrice: total,
            categoryId,
            confidence: 0.45,
          },
        ];

  return {
    kind: "transaction",
    type: payload.type === "income" ? "income" : "expense",
    description: buildReceiptDescription(input, normalizedItems),
    currency: detectCurrencyInText(searchableText) ?? (isCurrency(payload.currency) ? payload.currency : input.currency),
    items: normalizedItems,
    total,
  };
}

function parseExpenseText({
  text,
  currency,
  categories,
}: ParseTextExpenseInput): ParsedExpense {
  const isIncome = /(?:зарплат|salary|income|получил|доход)/i.test(text);
  const categoryId = isIncome
    ? findCategoryIdByType(categories, "income", "salary")
    : findCategoryIdByType(categories, "expense", "food");
  const matches = Array.from(
    text.matchAll(/([^\d\n,;:]+?)\s+([-+]?\d+(?:[\s.,]\d{3})*(?:[.,]\d+)?)/gu),
  );
  const items = matches
        .map((match): ParsedExpenseItem | null => {
      const amount = Number(match[2].replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(amount) || amount <= 0) return null;
      return {
        name: normalizeItemName(match[1].trim() || (isIncome ? "Доход" : "Расход")),
        amount: roundMoney(amount),
        quantity: 1,
        unitPrice: roundMoney(amount),
        categoryId,
        confidence: 0.72,
      };
    })
    .filter((item): item is ParsedExpenseItem => Boolean(item));

  if (items.length === 0) {
    const amount = detectAmountInText(text) ?? 0;
    items.push({
      name: isIncome ? "Доход" : text.trim() || "Расход",
      amount: roundMoney(amount),
      quantity: 1,
      unitPrice: roundMoney(amount),
      categoryId,
      confidence: amount > 0 ? 0.45 : 0.2,
    });
  }

  return {
    kind: "transaction",
    type: isIncome ? "income" : "expense",
    description: buildReceiptDescription({ text, currency, categories }, items),
    currency: detectCurrencyInText(text) ?? currency,
    items,
    total: roundMoney(items.reduce((sum, item) => sum + item.amount, 0)),
  };
}

export function parseTextInputLocally(input: ParseTextExpenseInput): ParsedTextInput {
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
