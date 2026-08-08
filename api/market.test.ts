import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMarketQuotes, validateMarketAssets } from "./market";

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
});
