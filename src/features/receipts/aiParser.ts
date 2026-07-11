import type { Category, Currency } from "../../shared/types/finance";
import { getSupabaseClient } from "../../shared/api/supabase";
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

export function buildReceiptAiPayload(input: ParseReceiptInput) {
  return {
    mode: "receipt",
    fileName: input.fileName,
    fileType: input.fileType,
    fileDataUrl: input.fileDataUrl,
    text: input.text,
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
    if (strict) {
      const error = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(error?.error === "Receipt recognition was incomplete" ? "receipt_incomplete" : "receipt_request_failed");
    }
    return null;
  } catch (error) {
    if (strict) throw error;
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
    const accountTypes = new Set(["bank", "card", "cash", "savings", "investment", "crypto", "debt", "credit", "mortgage", "custom"]);
    return {
      ...parsed,
      name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : "Счёт",
      type: accountTypes.has(parsed.type) ? parsed.type : "custom",
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
  const aiResult = await requestAiParser<ParsedExpense>(buildReceiptAiPayload(input), true);

  const normalized = normalizeParsedExpense(input, aiResult);
  if (normalized) return normalized;
  throw new Error("receipt_incomplete");
}
