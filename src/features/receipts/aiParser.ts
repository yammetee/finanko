import type { Category, Currency } from "../../shared/types/expense";
import { getSupabaseClient } from "../../shared/api/supabase";
import {
  detectCurrencyInText,
  normalizeParsedExpense,
  parseTextInputLocally,
  type ParseReceiptInput,
  type ParsedExpense,
} from "./expenseParser";

interface ParseTextInput {
  text: string;
  currency: Currency;
  categories: Category[];
}

export function buildReceiptAiPayload(input: ParseReceiptInput) {
  return {
    mode: "receipt",
    fileDataUrl: input.fileDataUrl,
    fallbackCurrency: input.currency,
    categories: input.categories.map((category) => category.name),
  };
}

async function requestAiParser<T>(payload: unknown, strict = false): Promise<T | null> {
  try {
    const supabase = await getSupabaseClient();
    const session = supabase ? (await supabase.auth.getSession()).data.session : null;
    if (!session) return null;
    const response = await fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ kind: "parse", payload }) });
    if (response.ok) return await response.json() as T;
    const error = await response.json().catch(() => null) as { error?: string } | null;
    if (response.status === 429 || error?.error === "Daily AI limit reached") {
      throw new Error("ai_daily_limit");
    }
    if (strict) {
      throw new Error("receipt_request_failed");
    }
    return null;
  } catch (error) {
    if (strict) throw error;
    return null;
  }
}

export async function parseTextInput(input: ParseTextInput): Promise<ParsedExpense> {
  const aiResult = await requestAiParser<ParsedExpense>({
    mode: "text",
    text: input.text,
    currency: input.currency,
    categories: input.categories.map((category) => category.name),
  });

  const parsed = aiResult ?? parseTextInputLocally(input);
  const explicitCurrency = detectCurrencyInText(input.text);

  const normalized = normalizeParsedExpense(input, parsed);
  return normalized
    ? explicitCurrency
      ? { ...normalized, currency: explicitCurrency }
      : normalized
    : parseTextInputLocally(input);
}

export async function parseReceiptInput(input: ParseReceiptInput): Promise<ParsedExpense> {
  const aiResult = await requestAiParser<ParsedExpense>(buildReceiptAiPayload(input), true);

  const normalized = normalizeParsedExpense(input, aiResult);
  if (normalized) return normalized;
  throw new Error("receipt_incomplete");
}
