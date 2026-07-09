import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

interface DevRequest {
  method?: string;
  url?: string;
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
const localDbRelativePath = "data/finanko.local.json";

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

function getLocalDbPath(root: string) {
  return path.join(root, localDbRelativePath);
}

async function readLocalDb(root: string): Promise<{ finance: Record<string, unknown> }> {
  try {
    const raw = await readFile(getLocalDbPath(root), "utf8");
    const parsed = JSON.parse(raw) as { finance?: Record<string, unknown> };
    return {
      finance:
        parsed.finance && typeof parsed.finance === "object" && !Array.isArray(parsed.finance)
          ? parsed.finance
          : {},
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { finance: {} };
    throw error;
  }
}

async function writeLocalDb(root: string, db: { finance: Record<string, unknown> }) {
  const filePath = getLocalDbPath(root);
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
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

      middlewares.use("/api/local-db/finance", async (request, response) => {
        const rawUrl = request.url ?? "";
        const pathname = new URL(rawUrl, "http://localhost").pathname;
        const rawKey = pathname.replace(/^\/api\/local-db\/finance\/?/, "").replace(/^\//, "");
        const key = rawKey ? decodeURIComponent(rawKey) : "";

        if (!key) {
          sendJson(response, 400, { error: "Missing finance storage key" });
          return;
        }

        try {
          const db = await readLocalDb(server.config.root);

          if (request.method === "GET") {
            if (!Object.prototype.hasOwnProperty.call(db.finance, key)) {
              sendJson(response, 404, { error: "Finance state not found" });
              return;
            }
            sendJson(response, 200, { value: db.finance[key] });
            return;
          }

          if (request.method === "PUT") {
            const payload = await readJsonBody(request);
            if (!isRecord(payload) || typeof payload.value !== "string") {
              sendJson(response, 400, { error: "Invalid finance state payload" });
              return;
            }
            db.finance[key] = payload.value;
            await writeLocalDb(server.config.root, db);
            sendJson(response, 200, { ok: true });
            return;
          }

          if (request.method === "DELETE") {
            delete db.finance[key];
            await writeLocalDb(server.config.root, db);
            sendJson(response, 200, { ok: true });
            return;
          }

          sendJson(response, 405, { error: "Method not allowed" });
        } catch {
          sendJson(response, 500, { error: "Local finance database failed" });
        }
      });

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
                      "For receipt images, use a receipt-parser workflow: first read visible OCR rows in visual order, then split them into line-item groups and summary fields, then reconcile the arithmetic.",
                      "Line-item groups are the product/service rows only. A line-item row usually has quantity at the left, item text in the middle, optional unit price after @, and line total at the far right.",
                      "For each receipt line item, return quantity, unitPrice, and amount. Amount is the line total. Example: '2 ... @11.00 22.00' means quantity 2, unitPrice 11, amount 22.",
                      "Summary fields are merchant/header/tax/receipt/date/payment/loyalty rows. Never return TAX#, VAT code, POS#, receipt number, barcode, phone, date, time, cash received, change, saved amount, or authorization codes as items.",
                      "Detect currency from the document itself. CP ALL, 7-Eleven Thailand, Thai text, บาท, ฿, or Thai payment labels mean THB unless another currency is explicitly printed. Do not copy the provided default currency when the receipt shows another currency.",
                      "Translate every returned item name to Russian as a concrete product/service name. Always make the best possible recognition from the visible row; do not describe uncertainty.",
                      "Never use vague or apologetic item names such as 'Около...', 'примерно...', 'похоже...', 'товар', 'продукт', 'позиция', 'не распознано', 'unknown', 'other', or 'другое'. Do not include uncertainty notes in parentheses.",
                      "If exact SKU text is hard to read, choose the most likely specific Russian name from the visible row context, store, price, and nearby OCR text. Do not invent extra rows.",
                      "Include every visible product row above the payment summary. If a discount/coupon/promotion changes the payable total, include it as a separate negative item with negative amount and negative unitPrice when possible.",
                      "For Thai CP ALL/7-Eleven receipts: 'ยอดรวม' is subtotal, 'ส่วนลด' is discount, 'ยอดสุทธิ' is final net payable total, 'เงินสด/เงินทอน' is cash received/change, and 'บิลนี้ประหยัด' or 'ประหยัด' is saved amount.",
                      "Total selection rules: use final net payable total when visible; otherwise use subtotal minus discounts; otherwise use sum of line items. Never use the largest visible number. Never use cash received, change, subtotal duplicate, saved amount, VAT, loyalty points, receipt number, tax ID, or barcode as total.",
                      "Reconcile before returning: sum positive product item amounts plus negative discounts must equal total within 0.01. If it does not, re-check summary fields and discount signs before output.",
                      "Example Thai 7-Eleven: subtotal 366.00, discount All Cafe 9.00, net 'ยอดสุทธิ 11 ชิ้น 357.00', cash/change 500.00/143.00, saved 9.00 means currency THB, total 357, and All Cafe is a -9 item.",
                      "Example Thai 7-Eleven: subtotal 436.00, discounts 5.00, 7.00, 4.00, net 'ยอดสุทธิ 11 ชิ้น 420.00', cash/change 1000.00/580.00, saved 16.00 means currency THB, total 420, and those discounts are negative items.",
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
