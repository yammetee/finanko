import { createClient } from "@supabase/supabase-js";

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

function parserSystem(mode: unknown) {
  const shared = "Return only data matching the supplied JSON schema. Currency aliases are strict: бат/baht/THB/฿/บาท = THB; руб/RUB/₽ = RUB; лари/GEL/₾/ლარი = GEL; доллар/USD/$ = USD. fallbackCurrency is only a last resort when the source contains no currency evidence. Any currency visible in text or image overrides fallbackCurrency. categoryId must be one of the supplied category names, never an invented database id. Numbers must be JSON numbers, not strings.";
  if (mode !== "receipt") {
    return `${shared} Parse short personal-finance text. If it describes a loan, credit, mortgage, deposit, or account, return kind=account and fill account fields; transaction fields may be null/empty. Otherwise return kind=transaction with one or more concrete items and fill transaction fields; account fields may be null. Preserve concrete Russian wording when the input is Russian. Split multiple explicitly priced purchases into separate items. Do not invent amounts. Never provide advice.`;
  }
  return `${shared} Parse every visible receipt row from top to bottom and return kind=transaction. Determine currency from the merchant, script and symbols; Thai receipts are THB and Georgian receipts are GEL regardless of fallbackCurrency. Separate product rows from headers, tax data, payment method, cash, change, loyalty, coupons, barcodes and totals. Return every product row with its line total. For weighed goods printed as grams, convert quantity to kilograms (336 g -> 0.336) and unitPrice to price per kilogram; never treat grams as hundreds of units. An amount is negative only when the receipt explicitly shows a minus sign or a discount word such as скидка, discount, ส่วนลด or ფასდაკლება. Quotes, brands, service lines and row position do not imply a discount. Use the final payable total and require sum(items.amount)=total within 0.01. For CP ALL, ยอดรวม is subtotal, ส่วนลด is discount, ยอดสุทธิ is net total, and เงินสด/เงินทอน is cash/change; ส่วนลดAllCafe 9.00 after subtotal 366 means −9 and net 357. Translate every Thai, Georgian and English product name into specific natural Russian while preserving a useful brand after the product type. Never replace a readable product with generic names such as операция, сбор, товар, продукт, позиция or другое. description is a short Russian list of the recognized purchases.`;
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
      return {
        ...row,
        amount: Math.abs(row.amount),
        unitPrice: typeof row.unitPrice === "number" ? Math.abs(row.unitPrice) : row.unitPrice,
      };
    }
    return item;
  });
  return receipt;
}

function isValidReceiptResult(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const receipt = value as { kind?: unknown; total?: unknown; items?: unknown };
  if (receipt.kind !== "transaction" || typeof receipt.total !== "number" || receipt.total <= 0 || !Array.isArray(receipt.items) || receipt.items.length === 0) return false;
  const itemsTotal = receipt.items.reduce((sum, item) => {
    if (!item || typeof item !== "object" || typeof (item as { amount?: unknown }).amount !== "number") return Number.NaN;
    return sum + ((item as { amount: number }).amount);
  }, 0);
  return Number.isFinite(itemsTotal) && Math.abs(itemsTotal - receipt.total) <= 0.01;
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
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
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
    const parse = kind === "parse";
    if (parse && payload.mode === "receipt") {
      const image = payload.fileDataUrl;
      if (typeof image !== "string" || !image.startsWith("data:image/")) {
        response.status(400).json({ error: "Receipt image is required" });
        return;
      }
      if (image.length > 2_500_000) {
        response.status(413).json({ error: "Receipt image is too large" });
        return;
      }
    }
    const system = parse
      ? parserSystem(payload.mode)
      : [
          "You are Finanko's premium personal-finance planning assistant. Produce one integrated assessment of the whole portfolio, not a menu of analyses and not a recap of the dashboard.",
          "Identify the user's highest-leverage next actions. Separate the balance sheet from observed cash flow and rank problems by materiality. High-interest or oversized liabilities normally matter more than trimming a small spending category.",
          "Each recommendation must say exactly what to do, why it comes before alternatives, and an observable target or completion condition. Never write tautologies such as 'reduce expenses to improve cash flow', generic encouragement, or cosmetic percentage-cut scenarios.",
          "If required inputs are missing, recommend the precise missing record to add, such as income, minimum debt payment, or due date, and explain which decision it unlocks. That is more useful than inventing a projection.",
          "Never call debt principal repayment an expense. Missing recorded income is not proof of no income. Accounts, savings, and debts are current balances, not monthly behavior. Never extrapolate sparse or all-time totals into a monthly or annual run rate.",
          "When dataQuality.canProject=false, focus on balance-sheet risks and data-completion actions. Do not recommend cutting a category based on a few transactions. When true, quantify actions only from supplied figures.",
          "Use account names and rates when they clarify priority, but never expose internal field names such as incomeTotal or netFlow in user-facing text.",
          "Write in the requested locale. Do not provide regulated investment, tax, legal, or individualized credit-product advice.",
        ].join(" ");
    const aiResponse = await fetch(`${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
        input: [{ role: "system", content: system }, { role: "user", content: parse ? parserContent(payload) : JSON.stringify(payload) }],
        ...(parse ? { text: { format: parserFormat } } : {
          text: { format: {
            type: "json_schema",
            name: "finanko_portfolio_analysis",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["verdict", "diagnosis", "recommendations", "nextReview", "disclaimer"],
              properties: {
                verdict: { type: "string" },
                diagnosis: { type: "string" },
                recommendations: { type: "array", minItems: 1, maxItems: 3, items: {
                  type: "object", additionalProperties: false,
                  required: ["priority", "title", "action", "rationale", "target", "tone"],
                  properties: {
                    priority: { type: "integer", minimum: 1, maximum: 3 },
                    title: { type: "string" }, action: { type: "string" }, rationale: { type: "string" }, target: { type: "string" },
                    tone: { type: "string", enum: ["positive", "warning", "critical", "neutral"] },
                  },
                } },
                nextReview: { type: "string" },
                disclaimer: { type: "string" },
              },
            },
          } },
        }),
      }),
    });
    if (!aiResponse.ok) {
      response.status(502).json({ error: "AI request failed" });
      return;
    }
    const result = await aiResponse.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const text = result.output_text ?? result.output?.flatMap((item) => item.content ?? []).find((item) => item.text)?.text;
    if (!text) {
      response.status(502).json({ error: "Empty AI response" });
      return;
    }
    const parsed = parse && payload.mode === "receipt"
      ? normalizeReceiptResult(JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")))
      : JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
    if (parse && payload.mode === "receipt" && !isValidReceiptResult(parsed)) {
      response.status(502).json({ error: "Receipt recognition was incomplete" });
      return;
    }
    response.status(200).json(parse ? parsed : { analysis: parsed });
  } catch {
    response.status(500).json({ error: "AI request failed" });
  }
}
