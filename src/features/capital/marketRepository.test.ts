import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CapitalItem } from "./capitalTypes";

const { getSession, getSupabaseClient } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSupabaseClient: vi.fn(),
}));

vi.mock("../../shared/api/supabase", () => ({ getSupabaseClient }));

import { loadMarketHistory, loadMarketQuotes, searchMarketAssets } from "./marketRepository";

function marketItem(index: number, symbol = `SYM${index}`): CapitalItem {
  return {
    id: `item-${index}`,
    groupId: "group",
    name: `Asset ${index}`,
    type: "stock",
    symbol,
    quoteCurrency: "USD",
    primaryProvider: "nasdaq",
    fallbackProvider: "yahoo",
  };
}

function quoteResponse(body: string) {
  const request = JSON.parse(body) as { assets: Array<{ itemId: string }> };
  return {
    ok: true,
    json: async () => ({
      quotes: request.assets.map((asset) => ({
        itemId: asset.itemId,
        price: "1",
        currency: "USD",
        provider: "nasdaq",
        quotedAt: "2026-08-08T00:00:00.000Z",
      })),
    }),
  } as Response;
}

describe("capital market repository", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getSession.mockReset().mockResolvedValue({ data: { session: { access_token: "token" } } });
    getSupabaseClient.mockReset().mockResolvedValue({ auth: { getSession } });
  });

  it("chunks current quotes at the API limit and keeps every valid result", async () => {
    const requests: Array<{ assets: Array<{ itemId: string; symbol: string }> }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = String(init?.body);
      requests.push(JSON.parse(body));
      return quoteResponse(body);
    });

    const quotes = await loadMarketQuotes([
      ...Array.from({ length: 65 }, (_, index) => marketItem(index)),
      marketItem(999, "BAD/SYMBOL"),
    ]);

    expect(requests.map((request) => request.assets.length)).toEqual([30, 30, 5]);
    expect(requests.flatMap((request) => request.assets).some((asset) => asset.itemId === "item-999")).toBe(false);
    expect(quotes).toHaveLength(65);
    expect(new Set(quotes.map((quote) => quote.itemId)).size).toBe(65);
    expect(getSession).toHaveBeenCalledOnce();
  });

  it("chunks history requests with the same contract", async () => {
    const requests: Array<{ mode?: string; startDate?: string; assets: unknown[] }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = String(init?.body);
      requests.push(JSON.parse(body));
      return quoteResponse(body);
    });

    await expect(loadMarketHistory(Array.from({ length: 31 }, (_, index) => marketItem(index)), "2026-01-01")).resolves.toHaveLength(31);
    expect(requests.map((request) => [request.mode, request.startDate, request.assets.length])).toEqual([
      ["history", "2026-01-01", 30],
      ["history", "2026-01-01", 1],
    ]);
  });

  it("keeps successful chunks when another chunk fails", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockImplementationOnce(async (_url, init) => quoteResponse(String(init?.body)));

    const quotes = await loadMarketQuotes(Array.from({ length: 31 }, (_, index) => marketItem(index)));
    expect(quotes.map((quote) => quote.itemId)).toEqual(["item-30"]);
  });

  it("uses the shared authenticated request for search", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ assets: [{ name: "Apple", symbol: "AAPL", type: "stock", provider: "nasdaq", providerAssetId: "AAPL" }] }),
    } as Response);

    await expect(searchMarketAssets("Apple")).resolves.toEqual([expect.objectContaining({ symbol: "AAPL" })]);
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({ mode: "search", query: "Apple" });
  });
});
