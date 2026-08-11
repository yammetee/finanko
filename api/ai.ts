import { getAuthenticatedUserId } from "./_serverRequest";

interface ApiRequest {
  method?: string;
  headers: { authorization?: string };
  body?: { kind?: "parse"; payload?: Record<string, unknown>; [key: string]: unknown };
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

type SupportedCurrency = "USD" | "GEL" | "RUB" | "THB";

type ValidatedAiPayload =
  | { mode: "text"; text: string; currency: SupportedCurrency; categories: string[] }
  | { mode: "receipt"; fileDataUrl: string; fallbackCurrency: SupportedCurrency; categories: string[] };

interface PayloadValidationResult {
  payload?: ValidatedAiPayload;
  status?: number;
  error?: string;
}

interface AiQuotaResult {
  allowed: boolean;
  is_admin: boolean;
  requests_used: number;
  requests_limit: number | null;
}

const supportedCurrencies = new Set<SupportedCurrency>(["USD", "GEL", "RUB", "THB"]);
const receiptDataUrlPattern = /^data:image\/(?:jpeg|png|webp|heic|heif);base64,/i;
const unsafeTextPattern = /(?:https?:\/\/|www\.|(?:[a-z0-9-]+\.)+(?:com|net|org|io|ru|ge|co|app|dev|xyz)(?:[/?#:]|\b)|phishing|фишинг|ფიშინგ|თაღლით|ฟิชชิง|หลอกลวง|jailbreak|взлом|hack(?:ing)?|scam|мошеннич|prompt\s*injection|system\s*prompt|игнорируй\s+(?:все\s+)?(?:предыдущие|системные)\s+инструкции|ignore\s+(?:all\s+)?previous\s+instructions|წინა\s+ინსტრუქციების\s+იგნორირება|ละเว้นคำสั่งก่อนหน้า)/iu;
const credentialPattern = /(?:\b(?:password|login|otp|2fa|cvv|cvc|pin|api[\s_-]*key|access[\s_-]*token|private[\s_-]*key|seed[\s_-]*phrase|verification[\s_-]*code)\b|парол|логин|одноразов(?:ый|ого)\s+код|код\s+подтверждения|пин[-\s]?код|сид[-\s]?фраз|приватн(?:ый|ого)\s+ключ|секретн(?:ый|ого)\s+ключ|номер\s+(?:банковской\s+)?карт|პაროლ|ბარათის\s+ნომერ|პირადი\s+გასაღებ|รหัสผ่าน|รหัสยืนยัน|หมายเลขบัตร|คีย์ส่วนตัว|วลีกู้คืน)/iu;
const moneyAmountPattern = /(?:\d(?:[\d\s.,]*\d)?|[$€₾₽฿])/u;
const financeContextPattern = /(?:\b(?:usd|gel|rub|thb|lari|baht|money|spent|paid|bought|purchase|expense|receipt|coffee|food|grocery|taxi|rent|bill|subscription|medicine|fuel)\b|потрат|купил|купила|покуп|оплат|заплат|расход|чек|кофе|еда|продукт|магазин|такси|транспорт|аренд|коммун|подписк|сч[её]т|обед|ужин|завтрак|лекарств|одежд|билет|топлив|бензин|руб|доллар|лари|бат)/iu;
const unsupportedMoneyContextPattern = /(?:\b(?:salary|income|loan|credit|mortgage|deposit|account|transfer)\b|зарплат|доход|кредит|ипотек|вклад|перевод|ხელფას|შემოსავალ|სესხ|ანგარიშ|გადარიცხვ|เงินเดือน|รายได้|เงินกู้|สินเชื่อ|บัญชี|โอนเงิน)/iu;
const generalRequestPattern = /(?:\b(?:write|tell|explain|generate|create|translate|summarize|code|script|email|essay|story)\b|напиши|расскажи|объясни|сгенерируй|создай|переведи|резюмируй|сценари|письмо|истори|реферат|стать|დაწერე|მომიყევი|ახსენი|შექმენი|თარგმნე|เขียน|เล่า|อธิบาย|สร้าง|แปล)/iu;

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: Set<string>) {
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function validatedCategories(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) return null;
  if (!value.every((category) => typeof category === "string" && category.trim().length > 0 && category.trim().length <= 120)) return null;
  return value.map((category) => (category as string).trim());
}

function validatedCurrency(value: unknown): SupportedCurrency | null {
  return typeof value === "string" && supportedCurrencies.has(value as SupportedCurrency)
    ? value as SupportedCurrency
    : null;
}

export function isFinancialExpenseText(text: string) {
  if (!moneyAmountPattern.test(text) || generalRequestPattern.test(text) || unsupportedMoneyContextPattern.test(text)) return false;
  if (financeContextPattern.test(text)) return true;
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  return text.length <= 120 && words.length >= 2 && words.length <= 12;
}

export function hasUnsafeTextIntent(text: string) {
  return unsafeTextPattern.test(text) || credentialPattern.test(text);
}

export function validateAiPayload(value: unknown): PayloadValidationResult {
  if (!value || typeof value !== "object") return { status: 400, error: "Invalid AI payload" };
  const raw = value as Record<string, unknown>;
  const categories = validatedCategories(raw.categories);
  if (!categories) return { status: 400, error: "Invalid categories" };

  if (raw.mode === "text") {
    if (!hasOnlyKeys(raw, new Set(["mode", "text", "currency", "categories"]))) {
      return { status: 400, error: "Unsupported text request fields" };
    }
    const currency = validatedCurrency(raw.currency);
    const text = typeof raw.text === "string" ? raw.text.trim() : "";
    if (!currency || text.length < 2 || text.length > 500) {
      return { status: 400, error: "Invalid text expense request" };
    }
    if (hasUnsafeTextIntent(text)) {
      return { status: 422, error: "Sensitive or unsafe text is not allowed" };
    }
    if (!isFinancialExpenseText(text)) {
      return { status: 422, error: "Only money-related expense text is allowed" };
    }
    return { payload: { mode: "text", text, currency, categories } };
  }

  if (raw.mode === "receipt") {
    if (!hasOnlyKeys(raw, new Set(["mode", "fileDataUrl", "fallbackCurrency", "categories"]))) {
      return { status: 400, error: "Unsupported receipt request fields" };
    }
    const fallbackCurrency = validatedCurrency(raw.fallbackCurrency);
    const fileDataUrl = typeof raw.fileDataUrl === "string" ? raw.fileDataUrl : "";
    if (!fallbackCurrency || !receiptDataUrlPattern.test(fileDataUrl)) {
      return { status: 400, error: "Valid receipt image is required" };
    }
    if (fileDataUrl.length > 2_500_000) {
      return { status: 413, error: "Receipt image is too large" };
    }
    return { payload: { mode: "receipt", fileDataUrl, fallbackCurrency, categories } };
  }

  return { status: 400, error: "Invalid parser mode" };
}

function positiveReceiptAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function roundReceiptMoney(value: number) {
  return Math.round(value * 100) / 100;
}

// Keep the serverless entrypoint self-contained so Vercel never has to load client source at runtime.
export function deriveReceiptTotal(ocr: Pick<ReceiptOcrResult, "rows" | "totals">) {
  if (positiveReceiptAmount(ocr.totals.total)) return roundReceiptMoney(ocr.totals.total);

  const explicitTotal = [...ocr.rows]
    .reverse()
    .find((row) => row.rowType === "total" && positiveReceiptAmount(row.amount))?.amount;
  if (positiveReceiptAmount(explicitTotal)) return roundReceiptMoney(explicitTotal);

  if (positiveReceiptAmount(ocr.totals.subtotal)) {
    const calculated = ocr.totals.subtotal
      - Math.abs(ocr.totals.discount ?? 0)
      + (ocr.totals.tax ?? 0);
    if (positiveReceiptAmount(calculated)) return roundReceiptMoney(calculated);
  }

  const itemTotal = ocr.rows.reduce((sum, row) => {
    if (!positiveReceiptAmount(row.amount)) return sum;
    if (row.rowType === "product") return sum + row.amount;
    if (row.rowType === "discount") return sum - Math.abs(row.amount);
    if (row.rowType === "tax") return sum + row.amount;
    return sum;
  }, 0);
  return positiveReceiptAmount(itemTotal) ? roundReceiptMoney(itemTotal) : null;
}

function parserContent(payload: Record<string, unknown>) {
  const { fileDataUrl, ...metadata } = payload;
  if (typeof fileDataUrl !== "string" || !fileDataUrl) return JSON.stringify(metadata);
  return [{ type: "input_text", text: JSON.stringify(metadata) }, { type: "input_image", image_url: fileDataUrl, detail: "high" }];
}

const parserFormat = {
  type: "json_schema",
  name: "evenkvit_parse_result",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "description", "currency", "items", "total", "type"],
    properties: {
      kind: { type: "string", enum: ["transaction"] },
      description: { type: ["string", "null"] },
      currency: { type: "string", enum: ["USD", "GEL", "RUB", "THB"] },
      total: { type: ["number", "null"] },
      items: { type: "array", items: {
        type: "object", additionalProperties: false,
        required: ["name", "amount", "currency", "quantity", "unitPrice", "categoryId", "confidence"],
        properties: {
          name: { type: "string" }, amount: { type: "number" }, quantity: { type: ["number", "null"] },
          currency: { type: "string", enum: ["USD", "GEL", "RUB", "THB"] },
          unitPrice: { type: ["number", "null"] }, categoryId: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      } },
      type: { type: "string", enum: ["expense"] },
    },
  },
};

const receiptOcrFormat = {
  type: "json_schema",
  name: "evenkvit_receipt_ocr",
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

function parserSystem(mode: unknown) {
  const shared = "Return only data matching the supplied JSON schema. Currency aliases are strict: бат/baht/THB/฿/บาท = THB; руб/RUB/₽ = RUB; лари/GEL/₾/ლარი = GEL; доллар/USD/$ = USD. fallbackCurrency is only a last resort when the source contains no currency evidence. Any currency visible in text or image overrides fallbackCurrency. Keep every explicitly priced product as a separate item, assign each item its own currency, and classify every item independently. Drinking water and other grocery beverages belong to Food, not Health. categoryId must be one of the supplied category names, never an invented database id. Numbers must be JSON numbers, not strings.";
  if (mode !== "receipt") {
    return `${shared} Parse only a concrete personal expense. Return kind=transaction and type=expense. Preserve concrete Russian wording when the input is Russian. Split multiple explicitly priced purchases into separate items. Do not interpret income, account creation, loans, advice, instructions, or unrelated questions as other product entities. Do not invent amounts. Never provide advice.`;
  }
  return `${shared} Assemble a receipt transaction from the supplied OCR rows and receipt image. Treat OCR rows as a row index, but visually verify names, quantities and amounts against the image and correct obvious OCR mistakes. Every returned item must map to one visible product; preserve product order and never invent a product. Exclude discounts, headers, subtotals, totals, payment, cash, change, loyalty and barcode rows. Use the final payable total only as receipt metadata and never alter a product amount merely to force arithmetic equality. For weighed goods printed as grams, convert quantity to kilograms and unitPrice to price per kilogram. Translate readable Thai, Georgian and English product names into specific natural Russian while preserving useful brands. If a name cannot be translated confidently, preserve the original readable name instead of guessing a different product or using generic names such as операция, сбор, товар, продукт, позиция or другое. description is a short Russian list of recognized purchases. Lower confidence whenever the image does not support a specific translation.`;
}

const receiptOcrSystem = "Read the receipt image as a document before interpreting it. Transcribe every visible row from top to bottom exactly enough to preserve names and numbers, classify each row, and keep product rows separate from subtotal, tax, total, payment, cash and change. Do not translate or invent missing text. Use null for unreadable numbers. For discounts, preserve the printed amount and classify the row as discount. Identify the final payable total rather than cash tendered, change, savings or subtotal. Thai receipts use THB and Georgian receipts use GEL when script or merchant context makes that clear. Report image-quality warnings and calibrated confidence. Return only the supplied JSON schema.";

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

async function consumeAiDailyQuota(supabaseUrl: string, supabaseKey: string, token: string) {
  const quotaResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_ai_daily_quota`, {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: "{}",
  });
  if (!quotaResponse.ok) throw new Error("AI quota check failed");
  const value = await quotaResponse.json() as unknown;
  const quota = (Array.isArray(value) ? value[0] : value) as Partial<AiQuotaResult> | undefined;
  if (!quota || typeof quota.allowed !== "boolean" || typeof quota.is_admin !== "boolean"
    || typeof quota.requests_used !== "number"
    || (quota.requests_limit !== null && typeof quota.requests_limit !== "number")) {
    throw new Error("Invalid AI quota response");
  }
  return quota as AiQuotaResult;
}

function normalizeReceiptResult(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const receipt = value as { items?: unknown };
  if (!Array.isArray(receipt.items)) return value;
  receipt.items = receipt.items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { name?: unknown; amount?: unknown; unitPrice?: unknown };
    const explicitDiscount = typeof row.name === "string" && /(?:скид|discount|coupon|promo|ส่วนลด|ფასდაკ)/i.test(row.name);
    if (explicitDiscount) return [];
    if (typeof row.amount === "number" && row.amount < 0) {
      return [{ ...row, amount: Math.abs(row.amount), unitPrice: typeof row.unitPrice === "number" ? Math.abs(row.unitPrice) : row.unitPrice }];
    }
    return [item];
  });
  return receipt;
}

function fallbackReceipt(ocr: ReceiptOcrResult, payload: Record<string, unknown>) {
  const categories = Array.isArray(payload.categories) ? payload.categories.filter((value): value is string => typeof value === "string") : [];
  const categoryId = categories[0] ?? "";
  const items = ocr.rows
    .filter((row) => row.rowType === "product" && typeof row.amount === "number" && row.amount !== 0)
    .map((row) => ({
      name: row.rawText,
      amount: Math.abs(row.amount as number),
      currency: ocr.currency === "UNKNOWN" ? payload.fallbackCurrency : ocr.currency,
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
    type: "expense",
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
  };
  return receipt;
}

export async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "POST, OPTIONS");
    response.status(204).end();
    return;
  }
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!token || !supabaseUrl || !supabaseKey) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!await getAuthenticatedUserId(supabaseUrl, supabaseKey, token)) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    const body = request.body;
    const kind = body?.kind;
    if (!body || typeof body !== "object" || !hasOnlyKeys(body, new Set(["kind", "payload"])) || kind !== "parse") {
      response.status(400).json({ error: "Invalid request kind" });
      return;
    }

    const validation = validateAiPayload(body.payload);
    if (!validation.payload) {
      response.status(validation.status ?? 400).json({ error: validation.error ?? "Invalid AI payload" });
      return;
    }
    const payload = validation.payload;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      response.status(503).json({ error: "AI is not configured" });
      return;
    }

    let quota: AiQuotaResult;
    try {
      quota = await consumeAiDailyQuota(supabaseUrl, supabaseKey, token);
    } catch {
      response.status(503).json({ error: "AI quota is temporarily unavailable" });
      return;
    }
    if (!quota.allowed) {
      response.status(429).json({
        error: "Daily AI limit reached",
        limit: quota.requests_limit,
        used: quota.requests_used,
      });
      return;
    }

    if (payload.mode === "receipt") {
      const image = payload.fileDataUrl;

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
      if (!reviewed || typeof reviewed !== "object" || (reviewed as { kind?: unknown }).kind !== "transaction") {
        reviewed = attachReceiptReview(fallbackReceipt(ocr, payload), ocr);
      }
      response.status(200).json(reviewed);
      return;
    }

    const parsed = await requestStructuredOutput(
      apiKey,
      parserSystem(payload.mode),
      parserContent(payload),
      parserFormat,
    );
    response.status(200).json(parsed);
  } catch (error) {
    console.error("evenkvit AI request failed", error);
    response.status(500).json({ error: "AI request failed" });
  }
}

export default handler;
