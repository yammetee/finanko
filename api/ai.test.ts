import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "./ai";

function responseRecorder() {
  return {
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
    },
    setHeader() {},
    end() {},
  };
}

function authenticatedAiEnv() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable");
  vi.stubEnv("OPENAI_API_KEY", "server-secret");
}

describe("AI serverless handler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("loads and answers preflight without external services", async () => {
    const response = {
      statusCode: 200,
      headers: new Map<string, string>(),
      payload: undefined as unknown,
      ended: false,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.payload = payload;
      },
      setHeader(name: string, value: string) {
        this.headers.set(name, value);
      },
      end() {
        this.ended = true;
      },
    };
    const endSpy = vi.spyOn(response, "end");

    await handler({ method: "OPTIONS", headers: {} }, response);

    expect(response.statusCode).toBe(204);
    expect(response.headers.get("Allow")).toBe("POST, OPTIONS");
    expect(endSpy).toHaveBeenCalledOnce();
  });

  it("rejects the removed assistant request kind", async () => {
    authenticatedAiEnv();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
    const response = responseRecorder();

    await handler({
      method: "POST",
      headers: { authorization: "Bearer token" },
      body: { kind: "assistant" as "parse", payload: {} },
    }, response);

    expect(response.statusCode).toBe(400);
    expect(response.payload).toEqual({ error: "Invalid request kind" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("preserves the text parser request and response contract", async () => {
    authenticatedAiEnv();
    const parsed = {
      kind: "transaction",
      description: "Coffee",
      currency: "GEL",
      items: [{
        name: "Coffee",
        amount: 12,
        quantity: null,
        unitPrice: null,
        categoryId: "Food",
        confidence: 0.9,
      }],
      total: 12,
      name: null,
      type: "expense",
      initialBalance: null,
      annualInterestRate: null,
      interestFrequency: null,
      loanTermMonths: null,
    };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ output_text: JSON.stringify(parsed) }),
      } as Response);
    const response = responseRecorder();

    await handler({
      method: "POST",
      headers: { authorization: "Bearer token" },
      body: {
        kind: "parse",
        payload: { mode: "text", text: "Coffee 12 GEL", currency: "USD", categories: ["Food"] },
      },
    }, response);

    const aiRequest = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(response.statusCode).toBe(200);
    expect(response.payload).toEqual(parsed);
    expect(aiRequest.text.format.name).toBe("finanko_parse_result");
    expect(aiRequest.input[1].content).toContain("Coffee 12 GEL");
  });

  it("preserves the two-stage receipt parser contract", async () => {
    authenticatedAiEnv();
    const ocr = {
      merchant: "Cafe",
      currency: "GEL",
      rows: [{
        rawText: "Coffee 12",
        rowType: "product",
        amount: 12,
        quantity: null,
        unitPrice: null,
        confidence: 0.95,
      }],
      totals: { subtotal: 12, discount: null, tax: null, total: 12 },
      documentConfidence: 0.95,
      warnings: [],
    };
    const parsed = {
      kind: "transaction",
      description: "Кофе",
      currency: "GEL",
      items: [{
        name: "Кофе",
        amount: 12,
        quantity: null,
        unitPrice: null,
        categoryId: "Food",
        confidence: 0.95,
      }],
      total: 12,
      name: null,
      type: "expense",
      initialBalance: null,
      annualInterestRate: null,
      interestFrequency: null,
      loanTermMonths: null,
    };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ output_text: JSON.stringify(ocr) }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ output_text: JSON.stringify(parsed) }),
      } as Response);
    const response = responseRecorder();

    await handler({
      method: "POST",
      headers: { authorization: "Bearer token" },
      body: {
        kind: "parse",
        payload: {
          mode: "receipt",
          fileDataUrl: "data:image/jpeg;base64,receipt",
          fallbackCurrency: "USD",
          categories: ["Food"],
        },
      },
    }, response);

    const ocrRequest = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    const parserRequest = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body));
    expect(response.statusCode).toBe(200);
    expect(response.payload).toEqual({
      ...parsed,
      receiptReview: {
        confidence: 0.95,
        requiresReview: false,
        warnings: [],
        rawRows: ["Coffee 12"],
        totals: ocr.totals,
      },
    });
    expect(ocrRequest.text.format.name).toBe("finanko_receipt_ocr");
    expect(parserRequest.text.format.name).toBe("finanko_parse_result");
  });
});
