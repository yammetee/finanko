import { describe, expect, it } from "vitest";
import { fetchMarketHistory, fetchMarketQuotes, searchMarketAssets } from "./market";

const liveDescribe = process.env.RUN_LIVE_MARKET_TESTS === "1" ? describe : describe.skip;
const startDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

liveDescribe("live capital market providers", () => {
  it("loads current prices from every configured provider", async () => {
    const quotes = await fetchMarketQuotes([
      { itemId: "btc-bybit", type: "crypto", symbol: "BTC", provider: "bybit", providerAssetId: "BTCUSDT", fallbackProvider: "coingecko", fallbackAssetId: "bitcoin" },
      { itemId: "btc-coingecko", type: "crypto", symbol: "BTC", provider: "coingecko", providerAssetId: "bitcoin", fallbackProvider: "bybit", fallbackAssetId: "BTCUSDT" },
      { itemId: "aapl-nasdaq", type: "stock", symbol: "AAPL", provider: "nasdaq", providerAssetId: "AAPL", fallbackProvider: "yahoo", fallbackAssetId: "AAPL" },
      { itemId: "aapl-yahoo", type: "stock", symbol: "AAPL", provider: "yahoo", providerAssetId: "AAPL", fallbackProvider: "nasdaq", fallbackAssetId: "AAPL" },
    ]);

    expect(quotes).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: "btc-bybit", provider: "bybit", currency: "USD" }),
      expect.objectContaining({ itemId: "btc-coingecko", provider: "coingecko", currency: "USD" }),
      expect.objectContaining({ itemId: "aapl-nasdaq", provider: "nasdaq", currency: "USD" }),
      expect.objectContaining({ itemId: "aapl-yahoo", provider: "yahoo", currency: "USD" }),
    ]));
    for (const quote of quotes) expect(Number(quote.price)).toBeGreaterThan(0);
  }, 30_000);

  it("loads historical prices from every configured provider", async () => {
    const quotes = await fetchMarketHistory([
      { itemId: "btc-bybit-history", type: "crypto", symbol: "BTC", provider: "bybit", providerAssetId: "BTCUSDT", fallbackProvider: "coingecko", fallbackAssetId: "bitcoin" },
      { itemId: "btc-coingecko-history", type: "crypto", symbol: "BTC", provider: "coingecko", providerAssetId: "bitcoin", fallbackProvider: "bybit", fallbackAssetId: "BTCUSDT" },
      { itemId: "aapl-nasdaq-history", type: "stock", symbol: "AAPL", provider: "nasdaq", providerAssetId: "AAPL", fallbackProvider: "yahoo", fallbackAssetId: "AAPL" },
      { itemId: "aapl-yahoo-history", type: "stock", symbol: "AAPL", provider: "yahoo", providerAssetId: "AAPL", fallbackProvider: "nasdaq", fallbackAssetId: "AAPL" },
    ], startDate);

    for (const [itemId, provider] of [
      ["btc-bybit-history", "bybit"],
      ["btc-coingecko-history", "coingecko"],
      ["aapl-nasdaq-history", "nasdaq"],
      ["aapl-yahoo-history", "yahoo"],
    ] as const) {
      expect(quotes.some((quote) => quote.itemId === itemId && quote.provider === provider && Number(quote.price) > 0)).toBe(true);
    }
  }, 60_000);

  it("searches live crypto and security catalogs", async () => {
    const results = await searchMarketAssets("bitcoin");
    expect(results.some((asset) => asset.provider === "coingecko" && asset.symbol === "BTC")).toBe(true);

    const securities = await searchMarketAssets("AAPL");
    expect(securities.some((asset) => asset.provider === "nasdaq" && asset.symbol === "AAPL")).toBe(true);
  }, 30_000);
});
