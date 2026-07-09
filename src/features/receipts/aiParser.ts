import type { Category, Currency } from "../../shared/types/finance";
import { AiDailyLimitError } from "../../shared/api/aiErrors";
import {
  detectAmountInText,
  detectCurrencyInText,
  parseReceiptMock,
  parseTextInputMock,
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
      const errorPayload = (await response.json().catch(() => null)) as {
        limit?: number;
        remaining?: number;
        resetDate?: string;
      } | null;
      if (response.status === 429) throw new AiDailyLimitError(errorPayload ?? undefined);
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof AiDailyLimitError) throw error;
    return null;
  }
}

export async function parseTextInput(input: ParseTextInput): Promise<ParsedTextInput> {
  const aiResult = await requestAiParser<ParsedTextInput>({
    mode: "text",
    text: input.text,
    currency: input.currency,
    categories: input.categories.map((category) => ({
      id: category.id,
      name: category.name,
      type: category.type,
    })),
  });

  const parsed = aiResult ?? parseTextInputMock(input);
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

  return explicitCurrency ? { ...parsed, currency: explicitCurrency } : parsed;
}

export async function parseReceiptInput(input: ParseReceiptInput): Promise<ParsedExpense> {
  const aiResult = await requestAiParser<ParsedExpense>({
    mode: "receipt",
    fileName: input.fileName,
    currency: input.currency,
    categories: input.categories.map((category) => ({
      id: category.id,
      name: category.name,
      type: category.type,
    })),
  });

  return aiResult ?? parseReceiptMock(input);
}
