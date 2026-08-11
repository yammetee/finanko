import { fetchWithTimeout } from "../../shared/api/fetchWithTimeout";
import { normalizeMarketSymbol } from "./marketContract";
import type { CapitalAssetSuggestion, CapitalItem, CapitalQuote } from "./capitalTypes";

const TRADING_VIEW_SECURITY_URL = "https://scanner.tradingview.com/america/scan";
const TRADING_VIEW_CRYPTO_URL = "https://scanner.tradingview.com/crypto/scan";
const SECURITY_EXCHANGES = ["NASDAQ", "NYSE", "AMEX", "CBOE"] as const;
const CRYPTO_EXCHANGES = ["COINBASE", "KRAKEN", "BINANCE", "BYBIT"] as const;
const COINGECKO_IDS: Record<string, string> = { BTC: "bitcoin", ETH: "ethereum", SOL: "solana", USDT: "tether", USDC: "usd-coin" };
const TRADING_VIEW_CRYPTO_ASSETS: Record<string, { name: string; ticker: string }> = {
  BTC: { name: "Bitcoin", ticker: "COINBASE:BTCUSD" },
  SOL: { name: "Solana", ticker: "COINBASE:SOLUSD" },
  WGNK: { name: "Wrapped Gonka", ticker: "UNISWAP3ETH:USDTWGNK_203EE8.USD" },
};
const TRADING_VIEW_CRYPTO_ALIASES: Record<string, string> = { bitcoin: "BTC", btc: "BTC", solana: "SOL", sol: "SOL", wgnk: "WGNK", "wrapped gonka": "WGNK" };
const TRADING_VIEW_LOGO_PATTERN = /^[a-z0-9][a-z0-9-]{0,100}$/;

interface TradingViewRow { s?: string; d?: unknown[] }
interface TradingViewResponse { data?: TradingViewRow[] }

function tradingViewLogoUrl(value: unknown) {
  return typeof value === "string" && TRADING_VIEW_LOGO_PATTERN.test(value)
    ? `https://s3-symbol-logo.tradingview.com/${value}.svg`
    : undefined;
}

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

async function tradingViewRequest(url: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<TradingViewResponse> {
  const response = await fetchWithTimeout(url, {
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
  const body = await tradingViewRequest(TRADING_VIEW_SECURITY_URL, {
    symbols: { tickers, query: { types: [] } },
    columns: ["name", "close", "currency", "exchange", "logoid"],
  });
  const quotes = new Map<string, { price: number; logoUrl?: string }>();
  for (const row of body.data ?? []) {
    const price = row.d?.[1];
    if (row.s && typeof price === "number" && Number.isFinite(price) && row.d?.[2] === "USD") {
      quotes.set(row.s, { price, logoUrl: tradingViewLogoUrl(row.d?.[4]) });
    }
  }
  const quotedAt = new Date().toISOString();
  return items.flatMap((item) => {
    const ticker = candidates.get(item.id)?.find((value) => quotes.has(value));
    const quote = ticker ? quotes.get(ticker) : undefined;
    return quote === undefined ? [] : [{ itemId: item.id, price: decimalNumber(quote.price), currency: "USD" as const, provider: "tradingview", quotedAt, logoUrl: quote.logoUrl }];
  });
}

function coinGeckoId(item: CapitalItem) {
  if (item.fallbackProvider === "coingecko" && item.fallbackAssetId) return item.fallbackAssetId;
  return COINGECKO_IDS[item.symbol!] ?? item.symbol!.toLowerCase();
}

function bybitSymbol(item: CapitalItem) {
  return `${item.symbol!.toUpperCase()}USDT`;
}

function cryptoCandidates(item: CapitalItem) {
  if (item.primaryProvider === "tradingview" && item.primaryAssetId?.includes(":")) return [item.primaryAssetId.toUpperCase()];
  const symbol = item.symbol!.toUpperCase();
  return [
    ...(TRADING_VIEW_CRYPTO_ASSETS[symbol] ? [TRADING_VIEW_CRYPTO_ASSETS[symbol].ticker] : []),
    `COINBASE:${symbol}USD`,
    `KRAKEN:${symbol}USD`,
    `BINANCE:${symbol}USDT`,
    `BYBIT:${symbol}USDT`,
  ];
}

async function loadTradingViewCryptoQuotes(items: CapitalItem[]): Promise<CapitalQuote[]> {
  if (!items.length) return [];
  const candidates = new Map(items.map((item) => [item.id, cryptoCandidates(item)]));
  const body = await tradingViewRequest(TRADING_VIEW_CRYPTO_URL, {
    symbols: { tickers: [...new Set([...candidates.values()].flat())], query: { types: [] } },
    columns: ["name", "close", "currency", "logoid"],
  });
  const quotes = new Map<string, { price: number; logoUrl?: string }>();
  for (const row of body.data ?? []) {
    const price = row.d?.[1];
    if (row.s && typeof price === "number" && Number.isFinite(price) && (row.d?.[2] === "USD" || row.d?.[2] === "USDT")) {
      quotes.set(row.s, { price, logoUrl: tradingViewLogoUrl(row.d?.[3]) });
    }
  }
  const quotedAt = new Date().toISOString();
  return items.flatMap((item) => {
    const ticker = candidates.get(item.id)?.find((value) => quotes.has(value));
    const quote = ticker ? quotes.get(ticker) : undefined;
    return quote ? [{ itemId: item.id, price: decimalNumber(quote.price), currency: "USD" as const, provider: "tradingview", quotedAt, logoUrl: quote.logoUrl }] : [];
  });
}

async function loadCryptoFallbackQuotes(items: CapitalItem[]): Promise<CapitalQuote[]> {
  if (!items.length) return [];
  const ids = [...new Set(items.map(coinGeckoId))];
  const [coinGeckoResult, bybitResult] = await Promise.allSettled([
    fetchWithTimeout(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids.join(","))}&precision=full`, {}, 8_000).then(async (response) => {
      if (!response.ok) throw new Error("CoinGecko unavailable");
      const body = await response.json() as Array<{ id?: string; current_price?: number; last_updated?: string; image?: string }>;
      return new Map(body.flatMap((coin) => coin.id ? [[coin.id, coin] as const] : []));
    }),
    fetchWithTimeout("https://api.bybit.com/v5/market/tickers?category=spot", {}, 8_000).then(async (response) => {
      if (!response.ok) throw new Error("Bybit unavailable");
      return response.json() as Promise<{ retCode?: number; time?: number; result?: { list?: Array<{ symbol?: string; lastPrice?: string }> } }>;
    }),
  ]);
  const coinGecko = coinGeckoResult.status === "fulfilled" ? coinGeckoResult.value : new Map<string, { current_price?: number; last_updated?: string; image?: string }>();
  const bybitBody = bybitResult.status === "fulfilled" && bybitResult.value.retCode === 0 ? bybitResult.value : undefined;
  const bybit = new Map((bybitBody?.result?.list ?? []).flatMap((row) => row.symbol && row.lastPrice && /^\d+(\.\d+)?$/.test(row.lastPrice) ? [[row.symbol, row.lastPrice] as const] : []));
  return items.flatMap((item) => {
    const coin = coinGecko.get(coinGeckoId(item));
    const pairPrice = bybit.get(bybitSymbol(item));
    const coinPrice = coin?.current_price;
    const coinQuotedAt = coin?.last_updated && Number.isFinite(Date.parse(coin.last_updated)) ? new Date(coin.last_updated).toISOString() : new Date().toISOString();
    if (typeof coinPrice === "number" && Number.isFinite(coinPrice)) return [{ itemId: item.id, price: decimalNumber(coinPrice), currency: "USD" as const, provider: "coingecko", quotedAt: coinQuotedAt, logoUrl: coin?.image }];
    if (pairPrice) return [{ itemId: item.id, price: pairPrice, currency: "USD" as const, provider: "bybit", quotedAt: new Date(bybitBody?.time ?? Date.now()).toISOString(), logoUrl: coin?.image }];
    return [];
  });
}

async function loadCryptoQuotes(items: CapitalItem[]) {
  let tradingViewQuotes: CapitalQuote[] = [];
  try { tradingViewQuotes = await loadTradingViewCryptoQuotes(items); }
  catch { /* Fall through to the configured public providers. */ }
  const resolved = new Set(tradingViewQuotes.map((quote) => quote.itemId));
  const unresolved = items.filter((item) => !resolved.has(item.id));
  return unresolved.length ? [...tradingViewQuotes, ...await loadCryptoFallbackQuotes(unresolved)] : tradingViewQuotes;
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
  const request = (field: "name" | "description") => tradingViewRequest(TRADING_VIEW_SECURITY_URL, {
    filter: [
      { left: field, operation: "match", right: query },
      { left: "exchange", operation: "in_range", right: CRYPTO_EXCHANGES },
    ],
    options: { lang: "en" },
    markets: ["america"],
    symbols: { query: { types: [] }, tickers: [] },
    columns: ["name", "description", "type", "subtype", "exchange", "currency", "logoid"],
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
      assets.set(providerAssetId, { name, symbol, type: assetType, provider: "tradingview", providerAssetId, logoUrl: tradingViewLogoUrl(row.d?.[6]) });
    }
  }
  const symbolQuery = normalizeMarketSymbol(query);
  return [...assets.values()]
    .sort((left, right) => Number(right.symbol === symbolQuery) - Number(left.symbol === symbolQuery))
    .slice(0, 10);
}

async function searchCryptoFallback(query: string, signal?: AbortSignal): Promise<CapitalAssetSuggestion[]> {
  const response = await fetchWithTimeout(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`, { signal }, 8_000);
  if (!response.ok) throw new Error("CoinGecko unavailable");
  const body = await response.json() as { coins?: Array<{ id?: string; name?: string; symbol?: string; market_cap_rank?: number; large?: string }> };
  return (body.coins ?? []).flatMap((coin) => {
    const symbol = normalizeMarketSymbol(coin.symbol);
    return coin.id && coin.name && symbol ? [{ name: coin.name, symbol, type: "crypto" as const, provider: "coingecko" as const, providerAssetId: coin.id, logoUrl: coin.large, rank: coin.market_cap_rank ?? Number.MAX_SAFE_INTEGER }] : [];
  }).sort((left, right) => left.rank - right.rank).slice(0, 10).map((asset) => ({
    name: asset.name,
    symbol: asset.symbol,
    type: asset.type,
    provider: asset.provider,
    providerAssetId: asset.providerAssetId,
    logoUrl: asset.logoUrl,
  }));
}

function cryptoPairScore(row: TradingViewRow, query: string, symbolQuery?: string) {
  const symbol = normalizeMarketSymbol(row.d?.[6]);
  const name = typeof row.d?.[7] === "string" ? row.d[7].trim() : "";
  const exchange = typeof row.d?.[4] === "string" ? row.d[4] : "";
  const exchangeRank = CRYPTO_EXCHANGES.indexOf(exchange as typeof CRYPTO_EXCHANGES[number]);
  return Number(name.toLocaleLowerCase() === query.trim().toLocaleLowerCase()) * 200
    + Number(query.trim().length <= 6 && symbol === symbolQuery) * 100
    + Number(row.d?.[5] === "USD") * 20
    + (exchangeRank < 0 ? 0 : CRYPTO_EXCHANGES.length - exchangeRank);
}

async function searchTradingViewCrypto(query: string, signal?: AbortSignal): Promise<CapitalAssetSuggestion[]> {
  const request = (field: "base_currency" | "base_currency_desc") => tradingViewRequest(TRADING_VIEW_CRYPTO_URL, {
    filter: [{ left: field, operation: "match", right: query }],
    options: { lang: "en" },
    markets: ["crypto"],
    symbols: { query: { types: [] }, tickers: [] },
    columns: ["name", "description", "type", "subtype", "exchange", "currency", "base_currency", "base_currency_desc", "logoid"],
    range: [0, 30],
  }, signal);
  const results = await Promise.allSettled([request("base_currency"), request("base_currency_desc")]);
  const symbolQuery = normalizeMarketSymbol(query);
  const assets = new Map<string, { asset: CapitalAssetSuggestion; score: number }>();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const row of result.value.data ?? []) {
      const symbol = normalizeMarketSymbol(row.d?.[6]);
      const name = typeof row.d?.[7] === "string" ? row.d[7].trim() : "";
      if (!row.s || !symbol || !name || row.d?.[2] !== "spot" || row.d?.[3] !== "crypto" || (row.d?.[5] !== "USD" && row.d?.[5] !== "USDT")) continue;
      const score = cryptoPairScore(row, query, symbolQuery);
      if (score <= (assets.get(symbol)?.score ?? -1)) continue;
      assets.set(symbol, { score, asset: { name, symbol, type: "crypto", provider: "tradingview", providerAssetId: row.s, logoUrl: tradingViewLogoUrl(row.d?.[8]) } });
    }
  }
  return [...assets.values()].sort((left, right) => right.score - left.score).slice(0, 10).map((value) => value.asset);
}

async function searchCrypto(query: string, signal?: AbortSignal) {
  const tradingView = await searchTradingViewCrypto(query, signal).catch(() => []);
  const knownSymbol = TRADING_VIEW_CRYPTO_ALIASES[query.trim().toLocaleLowerCase()];
  const known = knownSymbol ? TRADING_VIEW_CRYPTO_ASSETS[knownSymbol] : undefined;
  if (known) return [
    { name: known.name, symbol: knownSymbol, type: "crypto" as const, provider: "tradingview" as const, providerAssetId: known.ticker },
    ...tradingView.filter((asset) => asset.symbol !== knownSymbol),
  ].slice(0, 10);
  return tradingView.length ? tradingView : searchCryptoFallback(query, signal);
}

export function searchMarketAssets(query: string, type: CapitalAssetSuggestion["type"], signal?: AbortSignal) {
  return type === "crypto" ? searchCrypto(query, signal) : searchSecurities(query, type, signal);
}
