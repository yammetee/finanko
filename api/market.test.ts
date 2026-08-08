import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMarketHistory, fetchMarketQuotes, searchMarketAssets, validateMarketAssets } from "./market";

describe("market quote API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("accepts only a bounded allow-listed asset request", () => {
    expect(validateMarketAssets({ assets: [{ itemId: "btc", type: "crypto", symbol: "BTC", provider: "bybit" }] })).toHaveLength(1);
    expect(validateMarketAssets({ assets: [{ itemId: "apple", type: "stock", symbol: "AAPL", provider: "nasdaq", fallbackProvider: "yahoo" }] })).toHaveLength(1);
    expect(validateMarketAssets({ assets: [{ itemId: "btc", type: "crypto", symbol: "BTC/USD" }] })).toBeNull();
    expect(validateMarketAssets({ assets: Array.from({ length: 31 }, (_, index) => ({ itemId: String(index), type: "stock", symbol: "AAPL" })) })).toBeNull();
  });

  it("normalizes Bybit string prices without exposing vendor shapes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ retCode: 0, time: 1_786_000_000_000, result: { list: [{ lastPrice: "67123.4500" }] } }) } as Response);
    await expect(fetchMarketQuotes([{ itemId: "btc", type: "crypto", symbol: "BTC", provider: "bybit" }])).resolves.toEqual([expect.objectContaining({ itemId: "btc", price: "67123.4500", currency: "USD", provider: "bybit" })]);
  });

  it("normalizes a no-key Nasdaq security quote", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ data: { primaryData: { lastSalePrice: "$313.33", lastTradeTimestamp: "Aug 6, 2026" } }, status: { rCode: 200 } }) } as Response);
    await expect(fetchMarketQuotes([{ itemId: "apple", type: "stock", symbol: "AAPL", provider: "nasdaq" }])).resolves.toEqual([expect.objectContaining({ itemId: "apple", price: "313.33", currency: "USD", provider: "nasdaq" })]);
  });

  it("falls back from Nasdaq to a no-key Yahoo Finance quote", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: 315.25, regularMarketTime: 1_786_000_000 } }], error: null } }) } as Response);
    await expect(fetchMarketQuotes([{ itemId: "apple", type: "stock", symbol: "AAPL", provider: "nasdaq", fallbackProvider: "yahoo" }])).resolves.toEqual([expect.objectContaining({ itemId: "apple", price: "315.25", provider: "yahoo" })]);
  });

  it("falls back from Bybit to CoinGecko", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ bitcoin: { usd: 65000, last_updated_at: 1_786_000_000 } }) } as Response);
    await expect(fetchMarketQuotes([{ itemId: "btc", type: "crypto", symbol: "BTC", provider: "bybit", providerAssetId: "bitcoin" }])).resolves.toEqual([expect.objectContaining({ price: "65000", provider: "coingecko" })]);
  });

  it("returns no quote when primary and fallback providers are unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 429 } as Response);
    await expect(fetchMarketQuotes([{ itemId: "btc", type: "crypto", symbol: "BTC", provider: "bybit" }])).resolves.toEqual([]);
  });

  it("requests a shared instrument once and maps its quote to every item", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ retCode: 0, result: { list: [{ lastPrice: "67000" }] } }) } as Response);
    await expect(fetchMarketQuotes([{ itemId: "btc-one", type: "crypto", symbol: "BTC" }, { itemId: "btc-two", type: "crypto", symbol: "BTC" }])).resolves.toEqual([
      expect.objectContaining({ itemId: "btc-one", price: "67000" }),
      expect.objectContaining({ itemId: "btc-two", price: "67000" }),
    ]);
    expect(request).toHaveBeenCalledOnce();
  });

  it("normalizes and orders daily Bybit history", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ retCode: 0, result: { list: [["1786147200000", "1", "2", "1", "65000"]] } }) } as Response);
    await expect(fetchMarketHistory([{ itemId: "btc", type: "crypto", symbol: "BTC", provider: "bybit" }], "2026-08-01")).resolves.toEqual([expect.objectContaining({ itemId: "btc", price: "65000", provider: "bybit" })]);
  });

  it("normalizes no-key Nasdaq daily security history", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ data: { tradesTable: { rows: [{ date: "08/07/2026", close: "$220.50" }] } }, status: { rCode: 200 } }) } as Response);
    await expect(fetchMarketHistory([{ itemId: "apple", type: "stock", symbol: "AAPL", provider: "nasdaq" }], "2026-08-01")).resolves.toEqual([expect.objectContaining({ itemId: "apple", price: "220.50", provider: "nasdaq", quotedAt: "2026-08-07T21:00:00.000Z" })]);
  });

  it("falls back from Nasdaq to no-key Yahoo Finance history", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ chart: { result: [{ timestamp: [1_786_118_400], indicators: { quote: [{ close: [221.75] }] } }], error: null } }) } as Response);
    await expect(fetchMarketHistory([{ itemId: "apple", type: "stock", symbol: "AAPL", provider: "nasdaq", fallbackProvider: "yahoo" }], "2026-08-01")).resolves.toEqual([expect.objectContaining({ itemId: "apple", price: "221.75", provider: "yahoo" })]);
  });

  it("normalizes editable crypto and security search suggestions", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => ({ coins: [{ id: "bitcoin", name: "Bitcoin", symbol: "btc", market_cap_rank: 1 }] }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ symbol: "VT", name: " Vanguard Total World Stock ETF", asset: "ETF" }] }) } as Response);
    await expect(searchMarketAssets("bt")).resolves.toEqual([
      { name: "Bitcoin", symbol: "BTC", type: "crypto", provider: "coingecko", providerAssetId: "bitcoin" },
      { name: "Vanguard Total World Stock ETF", symbol: "VT", type: "fund", provider: "nasdaq", providerAssetId: "VT" },
    ]);
  });

  it("does not fail history rebuild when every provider rejects the request", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(fetchMarketHistory([{ itemId: "btc", type: "crypto", symbol: "BTC", provider: "bybit" }], "2026-08-01")).resolves.toEqual([]);
  });

});
