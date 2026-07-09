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
        const model = env.OPENAI_MODEL ?? env.VITE_OPENAI_MODEL ?? "gpt-5-4-nano";

        if (!apiKey || !model) {
          sendJson(response, 404, { error: "AI parser is not configured" });
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
                    "You parse personal finance input for Finanko. Return only strict JSON. If text describes a loan, credit, mortgage, deposit, or bank account, return an account object. If it describes spending or receipt items, return a transaction object. Do not give financial advice.",
                },
                {
                  role: "user",
                  content: JSON.stringify(payload),
                },
              ],
              text: {
                format: {
                  type: "json_schema",
                  name: "finanko_parse_result",
                  schema: {
                    type: "object",
                    additionalProperties: false,
                    oneOf: [
                      {
                        type: "object",
                        additionalProperties: false,
                        required: ["kind", "description", "currency", "items", "total"],
                        properties: {
                          kind: { const: "transaction" },
                          description: { type: "string" },
                          currency: { enum: ["USD", "GEL", "RUB", "THB"] },
                          total: { type: "number" },
                          items: {
                            type: "array",
                            items: {
                              type: "object",
                              additionalProperties: false,
                              required: ["name", "amount", "categoryId", "confidence"],
                              properties: {
                                name: { type: "string" },
                                amount: { type: "number" },
                                categoryId: { type: "string" },
                                confidence: { type: "number" },
                              },
                            },
                          },
                        },
                      },
                      {
                        type: "object",
                        additionalProperties: false,
                        required: ["kind", "name", "type", "currency", "initialBalance"],
                        properties: {
                          kind: { const: "account" },
                          name: { type: "string" },
                          type: { enum: ["bank", "card", "cash", "savings", "investment", "crypto", "debt", "credit", "mortgage", "custom"] },
                          currency: { enum: ["USD", "GEL", "RUB", "THB"] },
                          initialBalance: { type: "number" },
                          annualInterestRate: { type: "number" },
                          interestFrequency: { enum: ["daily", "monthly"] },
                          loanTermMonths: { type: "number" },
                        },
                      },
                    ],
                  },
                },
              },
            }),
          });

          if (!aiResponse.ok) {
            sendJson(response, aiResponse.status, { error: "OpenAI request failed" });
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
        const model = env.OPENAI_MODEL ?? env.VITE_OPENAI_MODEL ?? "gpt-5-4-nano";

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
            sendJson(response, aiResponse.status, { error: "OpenAI request failed" });
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
