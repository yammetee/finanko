import type { Category, Currency } from "../../shared/types/finance";
import {
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
    if (!response.ok) return null;
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
    categories: input.categories.map((category) => ({
      id: category.id,
      name: category.name,
      type: category.type,
    })),
  });

  return aiResult ?? parseTextInputMock(input);
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
