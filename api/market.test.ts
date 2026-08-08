import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMarketHistory, fetchMarketQuotes, searchMarketAssets, validateMarketAssets } from "./market";

describe("market quote API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("accepts only a bounded allow-listed asset request", () => {
    expect(validateMarketAssets({ assets: [{ itemId: "btc", type: "crypto", symbol: "BTC", provider: "bybit" }] })).toHaveLength(1);
    expect(validateMarketAssets({ assets: [{ itemId: "btc", type: "crypto", symbol: "BTC/USD" }] })).toBeNull();
    expect(validateMarketAssets({ assets: Array.from({ length: 31 }, (_, index) => ({ itemId: String(index), type: "stock", symbol: "AAPL" })) })).toBeNull();
  });

  it("normalizes Bybit string prices without exposing vendor shapes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ retCode: 0, time: 1_786_000_000_000, result: { list: [{ lastPrice: "67123.4500" }] } }) } as Response);
    await expect(fetchMarketQuotes([{ itemId: "btc", type: "crypto", symbol: "BTC", provider: "bybit" }])).resolves.toEqual([expect.objectContaining({ itemId: "btc", price: "67123.4500", currency: "USD", provider: "bybit" })]);
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

  it("normalizes Twelve Data daily security history when its server key is configured", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ values: [{ datetime: "2026-08-07", close: "220.50" }] }) } as Response);
    await expect(fetchMarketHistory([{ itemId: "apple", type: "stock", symbol: "AAPL", provider: "twelve_data" }], "2026-08-01", "server-key")).resolves.toEqual([expect.objectContaining({ itemId: "apple", price: "220.50", provider: "twelve_data", quotedAt: "2026-08-07T21:00:00.000Z" })]);
  });

  it("normalizes editable crypto and security search suggestions", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => ({ coins: [{ id: "bitcoin", name: "Bitcoin", symbol: "btc", market_cap_rank: 1 }] }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ symbol: "VT", instrument_name: "Vanguard Total World Stock ETF", instrument_type: "ETF", currency: "USD" }] }) } as Response);
    await expect(searchMarketAssets("bt", "server-key")).resolves.toEqual([
      { name: "Bitcoin", symbol: "BTC", type: "crypto", provider: "coingecko", providerAssetId: "bitcoin" },
      { name: "Vanguard Total World Stock ETF", symbol: "VT", type: "fund", provider: "twelve_data", providerAssetId: "VT" },
    ]);
  });

  it("does not fail history rebuild when every provider rejects the request", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(fetchMarketHistory([{ itemId: "btc", type: "crypto", symbol: "BTC", provider: "bybit" }], "2026-08-01")).resolves.toEqual([]);
  });

});
