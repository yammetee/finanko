import { fetchWithTimeout } from "../../shared/api/fetchWithTimeout";
import { normalizeMarketSymbol } from "./marketContract";
import type { CapitalAssetSuggestion, CapitalItem, CapitalQuote } from "./capitalTypes";

const TRADING_VIEW_URL = "https://scanner.tradingview.com/america/scan";
const SECURITY_EXCHANGES = ["NASDAQ", "NYSE", "AMEX", "CBOE"] as const;
const COINGECKO_IDS: Record<string, string> = { BTC: "bitcoin", ETH: "ethereum", SOL: "solana", USDT: "tether", USDC: "usd-coin" };

interface TradingViewRow { s?: string; d?: unknown[] }
interface TradingViewResponse { data?: TradingViewRow[] }

function decimalNumber(value: number) {
  if (!Number.isFinite(value)) throw new Error("Invalid market price");
  const text = String(value);
  if (!/[eE]/.test(text)) return text;
  const [coefficient, exponentText] = text.toLowerCase().split("e");
  const negative = coefficient.startsWith("-");
  const [whole, fraction = ""] = (negative ? coefficient.slice(1) : coefficient).split(".");
  const digits = `${whole}${fraction}`;
  const point = whole.length + Number(exponentText);
  const unsigned = point <= 0 ? `0.${"0".repeat(-point)}${digits}`
    : point >= digits.length ? `${digits}${"0".repeat(point - digits.length)}`
      : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return negative ? `-${unsigned}` : unsigned;
}

async function tradingViewRequest(body: Record<string, unknown>, signal?: AbortSignal): Promise<TradingViewResponse> {
  const response = await fetchWithTimeout(TRADING_VIEW_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw new Error("TradingView unavailable");
  return response.json() as Promise<TradingViewResponse>;
}

function securityCandidates(item: CapitalItem) {
  if (item.primaryProvider === "tradingview" && item.primaryAssetId?.includes(":")) return [item.primaryAssetId.toUpperCase()];
  return SECURITY_EXCHANGES.map((exchange) => `${exchange}:${item.symbol!.toUpperCase()}`);
}

async function loadSecurityQuotes(items: CapitalItem[]): Promise<CapitalQuote[]> {
  if (!items.length) return [];
  const candidates = new Map(items.map((item) => [item.id, securityCandidates(item)]));
  const tickers = [...new Set([...candidates.values()].flat())];
  const body = await tradingViewRequest({
    symbols: { tickers, query: { types: [] } },
    columns: ["name", "close", "currency", "exchange"],
  });
  const prices = new Map<string, number>();
  for (const row of body.data ?? []) {
    const price = row.d?.[1];
    if (row.s && typeof price === "number" && Number.isFinite(price) && row.d?.[2] === "USD") prices.set(row.s, price);
  }
  const quotedAt = new Date().toISOString();
  return items.flatMap((item) => {
    const ticker = candidates.get(item.id)?.find((value) => prices.has(value));
    const price = ticker ? prices.get(ticker) : undefined;
    return price === undefined ? [] : [{ itemId: item.id, price: decimalNumber(price), currency: "USD" as const, provider: "tradingview", quotedAt }];
  });
}

function coinGeckoId(item: CapitalItem) {
  if (item.primaryProvider === "coingecko" && item.primaryAssetId) return item.primaryAssetId;
  if (item.fallbackProvider === "coingecko" && item.fallbackAssetId) return item.fallbackAssetId;
  return COINGECKO_IDS[item.symbol!] ?? item.symbol!.toLowerCase();
}

function bybitSymbol(item: CapitalItem) {
  if (item.primaryProvider === "bybit" && item.primaryAssetId) return item.primaryAssetId.toUpperCase();
  if (item.fallbackProvider === "bybit" && item.fallbackAssetId) return item.fallbackAssetId.toUpperCase();
  return `${item.symbol!.toUpperCase()}USDT`;
}

async function loadCryptoQuotes(items: CapitalItem[]): Promise<CapitalQuote[]> {
  if (!items.length) return [];
  const ids = [...new Set(items.map(coinGeckoId))];
  const [coinGeckoResult, bybitResult] = await Promise.allSettled([
    fetchWithTimeout(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=usd&include_last_updated_at=true`, {}, 8_000).then(async (response) => {
      if (!response.ok) throw new Error("CoinGecko unavailable");
      return response.json() as Promise<Record<string, { usd?: number; last_updated_at?: number }>>;
    }),
    fetchWithTimeout("https://api.bybit.com/v5/market/tickers?category=spot", {}, 8_000).then(async (response) => {
      if (!response.ok) throw new Error("Bybit unavailable");
      return response.json() as Promise<{ retCode?: number; time?: number; result?: { list?: Array<{ symbol?: string; lastPrice?: string }> } }>;
    }),
  ]);
  const coinGecko = coinGeckoResult.status === "fulfilled" ? coinGeckoResult.value : {};
  const bybitBody = bybitResult.status === "fulfilled" && bybitResult.value.retCode === 0 ? bybitResult.value : undefined;
  const bybit = new Map((bybitBody?.result?.list ?? []).flatMap((row) => row.symbol && row.lastPrice && /^\d+(\.\d+)?$/.test(row.lastPrice) ? [[row.symbol, row.lastPrice] as const] : []));
  return items.flatMap((item) => {
    const coin = coinGecko[coinGeckoId(item)];
    const pairPrice = bybit.get(bybitSymbol(item));
    const preferCoinGecko = item.primaryProvider === "coingecko";
    if (preferCoinGecko && typeof coin?.usd === "number" && Number.isFinite(coin.usd)) return [{ itemId: item.id, price: decimalNumber(coin.usd), currency: "USD" as const, provider: "coingecko", quotedAt: new Date((coin.last_updated_at ?? Date.now() / 1000) * 1000).toISOString() }];
    if (pairPrice) return [{ itemId: item.id, price: pairPrice, currency: "USD" as const, provider: "bybit", quotedAt: new Date(bybitBody?.time ?? Date.now()).toISOString() }];
    if (typeof coin?.usd === "number" && Number.isFinite(coin.usd)) return [{ itemId: item.id, price: decimalNumber(coin.usd), currency: "USD" as const, provider: "coingecko", quotedAt: new Date((coin.last_updated_at ?? Date.now() / 1000) * 1000).toISOString() }];
    return [];
  });
}

export async function loadMarketQuotes(items: CapitalItem[]) {
  const marketItems = items.filter((item) => item.symbol && normalizeMarketSymbol(item.symbol));
  const results = await Promise.allSettled([
    loadSecurityQuotes(marketItems.filter((item) => item.type === "stock" || item.type === "fund")),
    loadCryptoQuotes(marketItems.filter((item) => item.type === "crypto")),
  ]);
  return results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}

async function searchSecurities(query: string, type: "stock" | "fund", signal?: AbortSignal): Promise<CapitalAssetSuggestion[]> {
  const request = (field: "name" | "description") => tradingViewRequest({
    filter: [{ left: field, operation: "match", right: query }],
    options: { lang: "en" },
    markets: ["america"],
    symbols: { query: { types: [] }, tickers: [] },
    columns: ["name", "description", "type", "subtype", "exchange", "currency"],
    range: [0, 20],
  }, signal);
  const results = await Promise.allSettled([request("name"), request("description")]);
  const assets = new Map<string, CapitalAssetSuggestion>();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const row of result.value.data ?? []) {
      const symbol = normalizeMarketSymbol(row.d?.[0]);
      const name = typeof row.d?.[1] === "string" ? row.d[1].trim() : "";
      const assetType = row.d?.[2] === "stock" ? "stock" as const : row.d?.[2] === "fund" ? "fund" as const : undefined;
      const exchange = typeof row.d?.[4] === "string" ? row.d[4] : "";
      if (!symbol || !name || assetType !== type || !SECURITY_EXCHANGES.includes(exchange as typeof SECURITY_EXCHANGES[number]) || row.d?.[5] !== "USD") continue;
      const providerAssetId = `${exchange}:${symbol}`;
      assets.set(providerAssetId, { name, symbol, type: assetType, provider: "tradingview", providerAssetId });
    }
  }
  const symbolQuery = normalizeMarketSymbol(query);
  return [...assets.values()]
    .sort((left, right) => Number(right.symbol === symbolQuery) - Number(left.symbol === symbolQuery))
    .slice(0, 10);
}

async function searchCrypto(query: string, signal?: AbortSignal): Promise<CapitalAssetSuggestion[]> {
  const response = await fetchWithTimeout(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`, { signal }, 8_000);
  if (!response.ok) throw new Error("CoinGecko unavailable");
  const body = await response.json() as { coins?: Array<{ id?: string; name?: string; symbol?: string; market_cap_rank?: number }> };
  return (body.coins ?? []).flatMap((coin) => {
    const symbol = normalizeMarketSymbol(coin.symbol);
    return coin.id && coin.name && symbol ? [{ name: coin.name, symbol, type: "crypto" as const, provider: "coingecko" as const, providerAssetId: coin.id, rank: coin.market_cap_rank ?? Number.MAX_SAFE_INTEGER }] : [];
  }).sort((left, right) => left.rank - right.rank).slice(0, 10).map((asset) => ({
    name: asset.name,
    symbol: asset.symbol,
    type: asset.type,
    provider: asset.provider,
    providerAssetId: asset.providerAssetId,
  }));
}

export function searchMarketAssets(query: string, type: CapitalAssetSuggestion["type"], signal?: AbortSignal) {
  return type === "crypto" ? searchCrypto(query, signal) : searchSecurities(query, type, signal);
}
