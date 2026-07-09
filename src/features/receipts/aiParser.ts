import type { Category, Currency } from "../../shared/types/finance";
import {
  detectAmountInText,
  detectCurrencyInText,
  normalizeParsedExpense,
  parseTextInputLocally,
  type ParsedExpense,
  type ParsedTextInput,
} from "./expenseParser";

interface ParseTextInput {
  text: string;
  currency: Currency;
  categories: Category[];
}

interface ParseReceiptInput {
  fileName: string;
  fileType?: string;
  fileDataUrl?: string;
  text?: string;
  currency: Currency;
  categories: Category[];
}

async function requestAiParser<T>(payload: unknown): Promise<T | null> {
  try {
    const response = await fetch("/api/ai/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function parseTextInput(input: ParseTextInput): Promise<ParsedTextInput> {
  const aiResult = await requestAiParser<ParsedTextInput>({
    mode: "text",
    text: input.text,
    currency: input.currency,
    categories: input.categories.map((category) => category.name),
  });

  const parsed = aiResult ?? parseTextInputLocally(input);
  const explicitCurrency = detectCurrencyInText(input.text);
  const explicitAmount = detectAmountInText(input.text);

  if (parsed.kind === "account") {
    return {
      ...parsed,
      currency: explicitCurrency ?? parsed.currency,
      initialBalance:
        Number.isFinite(parsed.initialBalance) && parsed.initialBalance > 0
          ? parsed.initialBalance
          : explicitAmount ?? 0,
    };
  }

  const normalized = normalizeParsedExpense(input, parsed);
  return normalized
    ? explicitCurrency
      ? { ...normalized, currency: explicitCurrency }
      : normalized
    : parseTextInputLocally(input);
}

export async function parseReceiptInput(input: ParseReceiptInput): Promise<ParsedExpense> {
  const aiResult = await requestAiParser<ParsedExpense>({
    mode: "receipt",
    fileName: input.fileName,
    fileType: input.fileType,
    fileDataUrl: input.fileDataUrl,
    text: input.text,
    currency: input.currency,
    categories: input.categories.map((category) => category.name),
  });

  const normalized = normalizeParsedExpense(input, aiResult);
  if (normalized) return normalized;
  throw new Error("Receipt could not be parsed");
}
