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
      ? "Parse personal-finance text or receipt images. Return strict JSON only. Use one of USD, GEL, RUB, THB. Transaction JSON contains kind, description, currency, total and items with name, amount, quantity, unitPrice, categoryId, confidence. categoryId is the best matching supplied category name. Account JSON contains kind, name, type, currency, initialBalance, annualInterestRate, interestFrequency, loanTermMonths. Receipt items must reconcile exactly to total; discounts are negative. Translate receipt item names to Russian. Never provide financial advice."
      : [
          "You are Finanko's analytical personal-finance assistant, not a motivational chatbot.",
          "Use only the supplied structured aggregates and the requested action. Separate balance-sheet facts (assets, liabilities, net worth) from period cash-flow facts (income, expenses, net flow).",
          "Never call debt principal repayment an expense. Never treat a missing income record as proof that the user has no income. Never annualize timeframe=all totals. Do not assume a high category is wasteful.",
          "Every insight must cite a supplied number and explain why it matters. Scenarios are descriptive what-if calculations, not instructions. If dataQuality.isSparse is true, lead with the limitation and keep conclusions narrow.",
          "Avoid generic advice such as track spending, make a budget, diversify, refinance, invest, or build an emergency fund unless the supplied numbers directly support a quantified scenario.",
          "Write in the requested locale. Do not provide regulated investment, tax, legal, or credit advice.",
        ].join(" ");
    const aiResponse = await fetch(`${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
        input: [{ role: "system", content: system }, { role: "user", content: parse ? parserContent(payload) : JSON.stringify(payload) }],
        ...(parse ? {} : {
          text: { format: {
            type: "json_schema",
            name: "finanko_portfolio_analysis",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["headline", "summary", "insights", "scenarios", "caveats"],
              properties: {
                headline: { type: "string" },
                summary: { type: "string" },
                insights: { type: "array", minItems: 1, maxItems: 4, items: {
                  type: "object", additionalProperties: false,
                  required: ["label", "value", "detail", "tone"],
                  properties: {
                    label: { type: "string" }, value: { type: "string" }, detail: { type: "string" },
                    tone: { type: "string", enum: ["positive", "warning", "critical", "neutral"] },
                  },
                } },
                scenarios: { type: "array", maxItems: 3, items: {
                  type: "object", additionalProperties: false,
                  required: ["title", "impact", "tradeoff"],
                  properties: { title: { type: "string" }, impact: { type: "string" }, tradeoff: { type: "string" } },
                } },
                caveats: { type: "array", maxItems: 3, items: { type: "string" } },
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
    const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
    response.status(200).json(parse ? parsed : { analysis: parsed });
  } catch {
    response.status(500).json({ error: "AI request failed" });
  }
}
