import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

interface DevRequest {
  method?: string;
  on(event: "data", callback: (chunk: unknown) => void): void;
  on(event: "end", callback: () => void): void;
  on(event: "error", callback: (error: unknown) => void): void;
}

interface DevResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body: string): void;
}

declare const fetch: (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

const maxAiParserTextChars = 20_000;

function readJsonBody(request: DevRequest) {
  return new Promise<unknown>((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response: DevResponse, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(payload));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildParserUserContent(payload: unknown) {
  if (!isRecord(payload)) return JSON.stringify(payload);

  const { fileDataUrl, ...metadata } = payload;
  const text = JSON.stringify(metadata);
  if (text.length > maxAiParserTextChars) return null;

  if (typeof fileDataUrl !== "string" || fileDataUrl.length === 0) return text;

  return [
    {
      type: "input_text",
      text,
    },
    {
      type: "input_image",
      image_url: fileDataUrl,
      detail: "high",
    },
  ];
}

function aiParserPlugin(): Plugin {
  return {
    name: "finanko-ai-parser",
    configureServer(server) {
      const middlewares = server.middlewares as unknown as {
        use(
          path: string,
          handler: (request: DevRequest, response: DevResponse) => Promise<void>,
        ): void;
      };

      middlewares.use("/api/exchange-rates", async (_request, response) => {
        const env = loadEnv(server.config.mode, server.config.root, "");
        const ratesUrl = env.EXCHANGE_RATES_URL ?? "https://open.er-api.com/v6/latest/USD";

        try {
          const ratesResponse = await fetch(ratesUrl);
          if (!ratesResponse.ok) {
            sendJson(response, ratesResponse.status, { error: "Exchange rates request failed" });
            return;
          }

          const data = (await ratesResponse.json()) as {
            time_last_update_utc?: string;
            date?: string;
            rates?: Record<string, number>;
          };
          const rates = data.rates ?? {};
          const date = data.date ?? data.time_last_update_utc ?? new Date().toISOString();

          sendJson(response, 200, {
            date,
            rates: {
              USD: 1,
              GEL: rates.GEL,
              RUB: rates.RUB,
              THB: rates.THB,
            },
          });
        } catch {
          sendJson(response, 502, { error: "Exchange rates unavailable" });
        }
      });

      middlewares.use("/api/ai/parse", async (request, response) => {
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "Method not allowed" });
          return;
        }

        const env = loadEnv(server.config.mode, server.config.root, "");
        const apiKey = env.OPENAI_API_KEY;
        const baseUrl = env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
        const model = env.OPENAI_MODEL ?? env.VITE_OPENAI_MODEL ?? "gpt-5.4-nano";

        if (!apiKey || !model) {
          sendJson(response, 404, { error: "AI parser is not configured" });
          return;
        }

        try {
          const payload = await readJsonBody(request);
          const userContent = buildParserUserContent(payload);
          if (!userContent) {
            sendJson(response, 413, { error: "AI parser payload is too large" });
            return;
          }

          const aiResponse = await fetch(`${baseUrl}/responses`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model,
              input: [
                {
                  role: "system",
                  content:
                    [
                      "You parse personal finance input for Finanko. Return only strict JSON.",
                      "The user payload contains categories as a compact array of names. For categoryId, return the best matching category name from that array or an empty string. Do not invent database ids.",
                      "If text describes a loan, credit, mortgage, deposit, or bank account, return an account object.",
                      "If it describes spending or receipt items, return a transaction object.",
                      "For short text expenses, parse the user's words as one or more transaction items. Example: 'завтрак и обед 500 бат' means one expense item named 'Завтрак и обед' with amount 500 and currency THB.",
                      "Currency aliases are strict: бат, баты, baht, Thai baht, THB, ฿, บาท mean THB; руб, рубли, RUB, ₽ mean RUB; лари, GEL, ₾, ქართული ლარი, ლარი mean GEL; доллар, dollars, USD, $ mean USD.",
                      "When the user text contains a currency alias, that explicit alias must override the provided default currency.",
                      "For receipt images, extract purchased product/service line items, not payment metadata.",
                      "For receipts, return the best-effort list of visible purchased line items. Do not fail the whole receipt because one line is unclear.",
                      "For each receipt line item, return quantity, unitPrice, and amount. Amount is the line total: quantity multiplied by unitPrice when both are visible.",
                      "If the receipt has discounts, coupons, or promotions that change the payable total, include each visible discount as a separate item with a negative amount and negative unitPrice when you can identify it.",
                      "Translate every returned item name to Russian, even when the receipt is Thai, English, Georgian, or Russian. Never return raw Thai, Georgian, or OCR-garbled item names. If exact translation is uncertain, return a useful Russian generic product name for that line.",
                      "Detect currency from the receipt itself: ฿/THB/Thai receipts usually mean THB, ₽/RUB means RUB, ₾/GEL means GEL, $/USD means USD. Do not blindly copy the provided default currency if the receipt shows another currency.",
                      "Do not use the largest visible number as total. Ignore card numbers, receipt numbers, tax IDs, dates, times, phone numbers, change, cash received, subtotal duplicates, and authorization codes as items.",
                      "For Thai receipts,ยอดสุทธิ means net/final payable total. เงินสด/เงินทอน are cash received/change and must not be total. บิลนี้ประหยัด or saved amount is not total.",
                      "For receipts, prefer the final paid/net total. Do not use cash received, change, VAT, loyalty points, barcode numbers, or saved amount as total.",
                      "Set description to a short Russian comma-separated summary of bought items.",
                      "Do not give financial advice.",
                    ].join(" "),
                },
                {
                  role: "user",
                  content: userContent,
                },
              ],
              text: {
                format: {
                  type: "json_schema",
                  name: "finanko_parse_result",
                  schema: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                      "kind",
                      "description",
                      "currency",
                      "items",
                      "total",
                      "name",
                      "type",
                      "initialBalance",
                      "annualInterestRate",
                      "interestFrequency",
                      "loanTermMonths",
                    ],
                    properties: {
                      kind: { type: "string", enum: ["transaction", "account"] },
                      description: { type: ["string", "null"] },
                      currency: { type: "string", enum: ["USD", "GEL", "RUB", "THB"] },
                      total: { type: ["number", "null"] },
                      items: {
                        type: "array",
                        items: {
                          type: "object",
                          additionalProperties: false,
                          required: [
                            "name",
                            "amount",
                            "quantity",
                            "unitPrice",
                            "categoryId",
                            "confidence",
                          ],
                          properties: {
                            name: { type: "string" },
                            amount: { type: "number" },
                            quantity: { type: ["number", "null"] },
                            unitPrice: { type: ["number", "null"] },
                            categoryId: { type: "string" },
                            confidence: { type: "number" },
                          },
                        },
                      },
                      name: { type: ["string", "null"] },
                      type: {
                        enum: [
                          "bank",
                          "card",
                          "cash",
                          "savings",
                          "investment",
                          "crypto",
                          "debt",
                          "credit",
                          "mortgage",
                          "custom",
                          "income",
                          "expense",
                          null,
                        ],
                      },
                      initialBalance: { type: ["number", "null"] },
                      annualInterestRate: { type: ["number", "null"] },
                      interestFrequency: { enum: ["daily", "monthly", null] },
                      loanTermMonths: { type: ["number", "null"] },
                    },
                  },
                },
              },
            }),
          });

          if (!aiResponse.ok) {
            sendJson(response, aiResponse.status, {
              error: "OpenAI request failed",
              detail: await aiResponse.json().catch(() => null),
            });
            return;
          }

          const data = (await aiResponse.json()) as {
            output_text?: string;
            output?: Array<{ content?: Array<{ text?: string }> }>;
          };
          const outputText =
            data.output_text ??
            data.output?.flatMap((item) => item.content ?? []).find((item) => item.text)?.text;

          if (!outputText) {
            sendJson(response, 502, { error: "Empty AI response" });
            return;
          }

          sendJson(response, 200, JSON.parse(outputText));
        } catch {
          sendJson(response, 500, { error: "AI parser failed" });
        }
      });

      middlewares.use("/api/ai/assistant", async (request, response) => {
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "Method not allowed" });
          return;
        }

        const env = loadEnv(server.config.mode, server.config.root, "");
        const apiKey = env.OPENAI_API_KEY;
        const baseUrl = env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
        const model = env.OPENAI_MODEL ?? env.VITE_OPENAI_MODEL ?? "gpt-5.4-nano";

        if (!apiKey || !model) {
          sendJson(response, 404, { error: "AI assistant is not configured" });
          return;
        }

        try {
          const payload = await readJsonBody(request);
          const aiResponse = await fetch(`${baseUrl}/responses`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model,
              input: [
                {
                  role: "system",
                  content:
                    "You are Finanko's finance assistant. Use only the provided aggregate portfolio summary and approved backend action. Do not provide regulated financial advice, investment recommendations, or instructions to take credit. Give concise observations, scenario tradeoffs, and approximate outcomes. Return plain text only.",
                },
                {
                  role: "user",
                  content: JSON.stringify(payload),
                },
              ],
            }),
          });

          if (!aiResponse.ok) {
            sendJson(response, aiResponse.status, {
              error: "OpenAI request failed",
              detail: await aiResponse.json().catch(() => null),
            });
            return;
          }

          const data = (await aiResponse.json()) as {
            output_text?: string;
            output?: Array<{ content?: Array<{ text?: string }> }>;
          };
          const outputText =
            data.output_text ??
            data.output?.flatMap((item) => item.content ?? []).find((item) => item.text)?.text;

          if (!outputText) {
            sendJson(response, 502, { error: "Empty AI response" });
            return;
          }

          sendJson(response, 200, { text: outputText });
        } catch {
          sendJson(response, 500, { error: "AI assistant failed" });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), aiParserPlugin()],
  build: {
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("recharts") || id.includes("d3-")) return "charts";
          if (id.includes("@supabase")) return "supabase";
        },
      },
    },
  },
});
