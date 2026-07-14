import { deriveReceiptTotal } from "../src/features/receipts/receiptRecovery";

interface ApiRequest {
  method?: string;
  headers: { authorization?: string };
  body?: { kind?: "parse" | "assistant"; payload?: Record<string, unknown> };
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(payload: unknown): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

interface ReceiptOcrRow {
  rawText: string;
  rowType: "product" | "discount" | "subtotal" | "tax" | "total" | "payment" | "change" | "header" | "other";
  amount: number | null;
  quantity: number | null;
  unitPrice: number | null;
  confidence: number;
}

interface ReceiptOcrResult {
  merchant: string | null;
  currency: "USD" | "GEL" | "RUB" | "THB" | "UNKNOWN";
  rows: ReceiptOcrRow[];
  totals: { subtotal: number | null; discount: number | null; tax: number | null; total: number | null };
  documentConfidence: number;
  warnings: string[];
}

function parserContent(payload: Record<string, unknown>) {
  const { fileDataUrl, ...metadata } = payload;
  if (typeof fileDataUrl !== "string" || !fileDataUrl) return JSON.stringify(metadata);
  return [{ type: "input_text", text: JSON.stringify(metadata) }, { type: "input_image", image_url: fileDataUrl, detail: "high" }];
}

const parserFormat = {
  type: "json_schema",
  name: "finanko_parse_result",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "description", "currency", "items", "total", "name", "type", "initialBalance", "annualInterestRate", "interestFrequency", "loanTermMonths"],
    properties: {
      kind: { type: "string", enum: ["transaction", "account"] },
      description: { type: ["string", "null"] },
      currency: { type: "string", enum: ["USD", "GEL", "RUB", "THB"] },
      total: { type: ["number", "null"] },
      items: { type: "array", items: {
        type: "object", additionalProperties: false,
        required: ["name", "amount", "quantity", "unitPrice", "categoryId", "confidence"],
        properties: {
          name: { type: "string" }, amount: { type: "number" }, quantity: { type: ["number", "null"] },
          unitPrice: { type: ["number", "null"] }, categoryId: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      } },
      name: { type: ["string", "null"] },
      type: { enum: ["bank", "card", "cash", "savings", "investment", "crypto", "debt", "credit", "mortgage", "custom", "income", "expense", null] },
      initialBalance: { type: ["number", "null"] },
      annualInterestRate: { type: ["number", "null"] },
      interestFrequency: { enum: ["daily", "monthly", null] },
      loanTermMonths: { type: ["number", "null"] },
    },
  },
};

const receiptOcrFormat = {
  type: "json_schema",
  name: "finanko_receipt_ocr",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["merchant", "currency", "rows", "totals", "documentConfidence", "warnings"],
    properties: {
      merchant: { type: ["string", "null"] },
      currency: { type: "string", enum: ["USD", "GEL", "RUB", "THB", "UNKNOWN"] },
      rows: { type: "array", items: {
        type: "object",
        additionalProperties: false,
        required: ["rawText", "rowType", "amount", "quantity", "unitPrice", "confidence"],
        properties: {
          rawText: { type: "string" },
          rowType: { type: "string", enum: ["product", "discount", "subtotal", "tax", "total", "payment", "change", "header", "other"] },
          amount: { type: ["number", "null"] },
          quantity: { type: ["number", "null"] },
          unitPrice: { type: ["number", "null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      } },
      totals: {
        type: "object",
        additionalProperties: false,
        required: ["subtotal", "discount", "tax", "total"],
        properties: {
          subtotal: { type: ["number", "null"] },
          discount: { type: ["number", "null"] },
          tax: { type: ["number", "null"] },
          total: { type: ["number", "null"] },
        },
      },
      documentConfidence: { type: "number", minimum: 0, maximum: 1 },
      warnings: { type: "array", items: { type: "string", enum: ["cropped", "blurred", "low_contrast", "unreadable_rows", "total_unclear", "currency_unclear"] } },
    },
  },
};

const assistantFormat = {
  type: "json_schema",
  name: "finanko_actionable_insight",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["status", "headline", "summary", "evidence", "primaryAction", "scenario", "confidence", "nextCheck", "disclaimer"],
    properties: {
      status: { type: "string", enum: ["stable", "attention", "critical", "insufficient_data"] },
      headline: { type: "string" },
      summary: { type: "string" },
      evidence: { type: "array", maxItems: 2, items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "value"],
        properties: { label: { type: "string" }, value: { type: "string" } },
      } },
      primaryAction: {
        type: "object",
        additionalProperties: false,
        required: ["type", "title", "description", "buttonLabel"],
        properties: {
          type: { type: "string", enum: ["add_transaction", "review_transactions", "none"] },
          title: { type: "string" },
          description: { type: "string" },
          buttonLabel: { type: ["string", "null"] },
        },
      },
      scenario: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["opportunityId", "title", "suggestion", "reductionPercent"],
            properties: {
              opportunityId: { type: "string" },
              title: { type: "string" },
              suggestion: { type: "string" },
              reductionPercent: { type: "integer", enum: [25, 50] },
            },
          },
          { type: "null" },
        ],
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      nextCheck: { type: "string" },
      disclaimer: { type: "string" },
    },
  },
};

function parserSystem(mode: unknown) {
  const shared = "Return only data matching the supplied JSON schema. Currency aliases are strict: бат/baht/THB/฿/บาท = THB; руб/RUB/₽ = RUB; лари/GEL/₾/ლარი = GEL; доллар/USD/$ = USD. fallbackCurrency is only a last resort when the source contains no currency evidence. Any currency visible in text or image overrides fallbackCurrency. categoryId must be one of the supplied category names, never an invented database id. Numbers must be JSON numbers, not strings.";
  if (mode !== "receipt") {
    return `${shared} Parse short personal-finance text. If it describes a loan, credit, mortgage, deposit, or account, return kind=account and fill account fields; transaction fields may be null/empty. Otherwise return kind=transaction with one or more concrete items and fill transaction fields; account fields may be null. Preserve concrete Russian wording when the input is Russian. Split multiple explicitly priced purchases into separate items. Do not invent amounts. Never provide advice.`;
  }
  return `${shared} Assemble a receipt transaction from the supplied OCR rows and receipt image. Treat OCR rows as a row index, but visually verify names, quantities and amounts against the image and correct obvious OCR mistakes. Every returned item must map to one visible product or explicit discount row; preserve their order and never invent a product. Exclude headers, subtotals, totals, payment, cash, change, loyalty and barcode rows. Use the final payable total when present and never alter a readable amount merely to force arithmetic equality. For weighed goods printed as grams, convert quantity to kilograms and unitPrice to price per kilogram. Discounts must be negative. Translate readable Thai, Georgian and English product names into specific natural Russian while preserving useful brands. If a name cannot be translated confidently, preserve the original readable name instead of guessing a different product or using generic names such as операция, сбор, товар, продукт, позиция or другое. description is a short Russian list of recognized purchases. Lower confidence whenever the image does not support a specific translation.`;
}

const receiptOcrSystem = "Read the receipt image as a document before interpreting it. Transcribe every visible row from top to bottom exactly enough to preserve names and numbers, classify each row, and keep product rows separate from subtotal, tax, total, payment, cash and change. Do not translate or invent missing text. Use null for unreadable numbers. For discounts, preserve the printed amount and classify the row as discount. Identify the final payable total rather than cash tendered, change, savings or subtotal. Thai receipts use THB and Georgian receipts use GEL when script or merchant context makes that clear. Report image-quality warnings and calibrated confidence. Return only the supplied JSON schema.";

const assistantSystem = [
  "You are Finanko's concise personal-finance copilot. Return one useful insight, one next action, and at most one optional what-if scenario. Never produce an essay or repeat the dashboard.",
  "Keep headline under 12 words, summary under 35 words, action description under 30 words, and each evidence value short. Use calm, direct language without alarmism or praise.",
  "Identify the highest-leverage action from supplied facts. If required data is missing, ask for one concrete transaction or a history review using only the supported action types.",
  "Never call debt principal repayment an expense. Missing recorded income is not proof of no income. Accounts, savings, and debts are current balances, not monthly behavior. Never extrapolate sparse or all-time totals into a monthly or annual run rate.",
  "spendingOpportunities are conservative calculations made by Finanko from repeated item-level transactions. If that list is non-empty, scenario must select one supplied opportunityId and use 25 or 50 percent. Never calculate or change the money values yourself. If empty, scenario must be null.",
  "A scenario is optional and non-judgmental: explain what happens if the user reduces a repeated purchase, and suggest an obvious cheaper substitute only when useful. Do not label ordinary preferences as bad spending.",
  "When dataQuality.canProject=false, do not project categories or cash flow. A supplied spendingOpportunity is still valid because it has its own history threshold.",
  "Use account names and rates only when they clarify priority. Never expose internal field names.",
  "Write in the requested locale. Do not provide regulated investment, tax, legal, or individualized credit-product advice.",
].join(" ");

function extractOutputText(result: { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> }) {
  return result.output_text ?? result.output?.flatMap((item) => item.content ?? []).find((item) => item.text)?.text;
}

async function requestStructuredOutput(apiKey: string, system: string, input: unknown, format: unknown, model?: string) {
  const aiResponse = await fetch(`${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model ?? process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
      input: [{ role: "system", content: system }, { role: "user", content: input }],
      text: { format },
    }),
  });
  if (!aiResponse.ok) throw new Error("AI request failed");
  const result = await aiResponse.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const text = extractOutputText(result);
  if (!text) throw new Error("Empty AI response");
  return JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")) as unknown;
}

async function isAuthenticatedUser(supabaseUrl: string, supabaseKey: string, token: string) {
  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseKey,
      authorization: `Bearer ${token}`,
    },
  });
  return authResponse.ok;
}

function normalizeReceiptResult(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const receipt = value as { items?: unknown };
  if (!Array.isArray(receipt.items)) return value;
  receipt.items = receipt.items.map((item) => {
    if (!item || typeof item !== "object") return item;
    const row = item as { name?: unknown; amount?: unknown; unitPrice?: unknown };
    const explicitDiscount = typeof row.name === "string" && /(?:скид|discount|coupon|promo|ส่วนลด|ფასდაკ)/i.test(row.name);
    if (typeof row.amount === "number" && row.amount < 0 && !explicitDiscount) {
      return { ...row, amount: Math.abs(row.amount), unitPrice: typeof row.unitPrice === "number" ? Math.abs(row.unitPrice) : row.unitPrice };
    }
    return item;
  });
  return receipt;
}

function fallbackReceipt(ocr: ReceiptOcrResult, payload: Record<string, unknown>) {
  const categories = Array.isArray(payload.categories) ? payload.categories.filter((value): value is string => typeof value === "string") : [];
  const categoryId = categories[0] ?? "";
  const items = ocr.rows
    .filter((row) => (row.rowType === "product" || row.rowType === "discount") && typeof row.amount === "number" && row.amount !== 0)
    .map((row) => ({
      name: row.rawText,
      amount: row.rowType === "discount" ? -Math.abs(row.amount as number) : Math.abs(row.amount as number),
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      categoryId,
      confidence: row.confidence,
    }));
  const total = deriveReceiptTotal(ocr);
  return {
    kind: "transaction",
    description: ocr.merchant ?? null,
    currency: ocr.currency === "UNKNOWN" ? payload.fallbackCurrency : ocr.currency,
    items,
    total,
    name: null,
    type: "expense",
    initialBalance: null,
    annualInterestRate: null,
    interestFrequency: null,
    loanTermMonths: null,
  };
}

function recoverReceiptTotal(value: unknown, ocr: ReceiptOcrResult) {
  if (!value || typeof value !== "object") return value;
  const receipt = value as { total?: unknown };
  if (typeof receipt.total === "number" && receipt.total > 0) return value;
  const recoveredTotal = deriveReceiptTotal(ocr);
  return recoveredTotal === null ? value : { ...receipt, total: recoveredTotal };
}

function attachReceiptReview(value: unknown, ocr: ReceiptOcrResult) {
  if (!value || typeof value !== "object") return value;
  const receipt = value as { total?: unknown; items?: unknown; receiptReview?: unknown };
  const items = Array.isArray(receipt.items) ? receipt.items : [];
  const itemTotal = items.reduce((sum, item) => {
    const amount = item && typeof item === "object" ? (item as { amount?: unknown }).amount : null;
    return typeof amount === "number" ? sum + amount : sum;
  }, 0);
  const warnings = new Set(ocr.warnings);
  const productTotal = ocr.rows.reduce(
    (sum, row) => row.rowType === "product" && typeof row.amount === "number" ? sum + Math.abs(row.amount) : sum,
    0,
  );
  if (typeof ocr.totals.subtotal === "number" && productTotal > 0 && Math.abs(productTotal - ocr.totals.subtotal) > 0.01) {
    warnings.add("subtotal_mismatch");
  }
  if (typeof ocr.totals.subtotal === "number" && typeof ocr.totals.total === "number") {
    const expectedTotal = ocr.totals.subtotal
      - Math.abs(ocr.totals.discount ?? 0)
      + (ocr.totals.tax ?? 0);
    if (Math.abs(expectedTotal - ocr.totals.total) > 0.01) warnings.add("totals_mismatch");
  }
  if (ocr.documentConfidence < 0.75 || ocr.rows.some((row) => row.rowType === "product" && row.confidence < 0.55)) warnings.add("low_confidence");
  if (items.length === 0) warnings.add("unreadable_rows");
  if (typeof receipt.total !== "number" || receipt.total <= 0) warnings.add("total_unclear");
  if (typeof receipt.total === "number" && Math.abs(itemTotal - receipt.total) > 0.01) warnings.add("arithmetic_mismatch");
  if (ocr.currency === "UNKNOWN") warnings.add("currency_unclear");
  receipt.receiptReview = {
    confidence: ocr.documentConfidence,
    requiresReview: warnings.size > 0 || ocr.documentConfidence < 0.82,
    warnings: Array.from(warnings),
    rawRows: ocr.rows.map((row) => row.rawText).filter(Boolean),
    totals: ocr.totals,
  };
  return receipt;
}

function hasUsableReceipt(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const receipt = value as { kind?: unknown; total?: unknown };
  return receipt.kind === "transaction" && typeof receipt.total === "number" && receipt.total > 0;
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "POST, OPTIONS");
    response.status(204).end();
    return;
  }
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !supabaseUrl || !supabaseKey) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!await isAuthenticatedUser(supabaseUrl, supabaseKey, token)) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    response.status(503).json({ error: "AI is not configured" });
    return;
  }

  try {
    const kind = request.body?.kind;
    const payload = request.body?.payload ?? {};
    if (kind !== "parse" && kind !== "assistant") {
      response.status(400).json({ error: "Invalid request kind" });
      return;
    }

    if (kind === "parse" && payload.mode === "receipt") {
      const image = payload.fileDataUrl;
      if (typeof image !== "string" || !image.startsWith("data:image/")) {
        response.status(400).json({ error: "Receipt image is required" });
        return;
      }
      if (image.length > 2_500_000) {
        response.status(413).json({ error: "Receipt image is too large" });
        return;
      }

      const receiptModel = process.env.OPENAI_RECEIPT_MODEL ?? "gpt-5.6-terra";
      const ocr = await requestStructuredOutput(apiKey, receiptOcrSystem, parserContent(payload), receiptOcrFormat, receiptModel) as ReceiptOcrResult;
      let parsed: unknown;
      try {
        parsed = await requestStructuredOutput(
          apiKey,
          parserSystem("receipt"),
          parserContent({
            fileDataUrl: image,
            ocr,
            fallbackCurrency: payload.fallbackCurrency,
            categories: payload.categories,
          }),
          parserFormat,
          receiptModel,
        );
      } catch {
        parsed = fallbackReceipt(ocr, payload);
      }
      let reviewed = attachReceiptReview(normalizeReceiptResult(recoverReceiptTotal(parsed, ocr)), ocr);
      if (!hasUsableReceipt(reviewed)) {
        reviewed = attachReceiptReview(fallbackReceipt(ocr, payload), ocr);
      }
      if (!hasUsableReceipt(reviewed)) {
        response.status(502).json({ error: "Receipt recognition was incomplete" });
        return;
      }
      response.status(200).json(reviewed);
      return;
    }

    const parsed = await requestStructuredOutput(
      apiKey,
      kind === "parse" ? parserSystem(payload.mode) : assistantSystem,
      kind === "parse" ? parserContent(payload) : JSON.stringify(payload),
      kind === "parse" ? parserFormat : assistantFormat,
    );
    response.status(200).json(kind === "parse" ? parsed : { analysis: parsed });
  } catch {
    response.status(500).json({ error: "AI request failed" });
  }
}
