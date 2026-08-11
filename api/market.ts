import { fetchWithTimeout } from "../src/shared/api/fetchWithTimeout";
import { getAuthenticatedUserId } from "../src/server/supabaseAuth";

const MARKET_REQUEST_LIMIT = 30;
const MARKET_SYMBOL_PATTERN = /^[A-Z0-9._-]{1,32}$/;

function normalizeMarketSymbol(value: unknown) {
  if (typeof value !== "string") return undefined;
  const symbol = value.trim().toUpperCase();
  return MARKET_SYMBOL_PATTERN.test(symbol) ? symbol : undefined;
}

type AssetType = "stock" | "fund" | "crypto";
type MarketProvider = "bybit" | "coingecko" | "nasdaq" | "yahoo";
interface MarketAsset { itemId: string; type: AssetType; symbol: string; provider?: MarketProvider; providerAssetId?: string; fallbackProvider?: MarketProvider; fallbackAssetId?: string }
interface ApiRequest { method?: string; headers: { authorization?: string }; body?: unknown }
interface ApiResponse { status(code: number): ApiResponse; json(payload: unknown): void; setHeader(name: string, value: string): void; end(): void }
interface NormalizedQuote { itemId: string; price: string; currency: "USD"; provider: string; quotedAt: string }
interface MarketSearchResult { name: string; symbol: string; type: AssetType; provider: "coingecko" | "nasdaq" | "yahoo"; providerAssetId: string }

const NASDAQ_HEADERS = { Accept: "application/json, text/plain, */*", "User-Agent": "Mozilla/5.0 (compatible; evenkvit/1.0)" };
const COINGECKO_IDS: Record<string, string> = { BTC: "bitcoin", ETH: "ethereum", SOL: "solana", USDT: "tether", USDC: "usd-coin" };
const MARKET_PROVIDERS: MarketProvider[] = ["bybit", "coingecko", "nasdaq", "yahoo"];
const MARKET_CACHE_MAX_ENTRIES = 500;
const QUOTE_FALLBACK_MAX_AGE_MS = 60 * 60_000;
const SEARCH_CACHE_TTL_MS = 5 * 60_000;
const HISTORY_CACHE_TTL_MS = 15 * 60_000;
const MARKET_RATE_WINDOW_MS = 60_000;
const MARKET_RATE_LIMITS = { search: 30, quotes: 60, history: 10 } as const;

interface CacheEntry { expiresAt: number; value?: unknown; request?: Promise<unknown> }
type CachePolicy = "cache-first" | "fallback-only";
const marketCache = new Map<string, CacheEntry>();
const marketRateWindows = new Map<string, { startedAt: number; count: number }>();

function pruneMarketCache(now: number) {
  for (const [key, entry] of marketCache) if (entry.expiresAt <= now) marketCache.delete(key);
  while (marketCache.size >= MARKET_CACHE_MAX_ENTRIES) {
    const oldestKey = marketCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    marketCache.delete(oldestKey);
  }
}

async function cachedMarketValue<T>(key: string, ttlMs: number, load: () => Promise<T>, policy: CachePolicy = "cache-first"): Promise<T> {
  const now = Date.now();
  pruneMarketCache(now);
  const cached = marketCache.get(key);
  if (cached && cached.expiresAt > now) {
    if (cached.request) return cached.request as Promise<T>;
    if (policy === "cache-first") return cached.value as T;
  }
  const fallback = cached?.value !== undefined && cached.expiresAt > now ? cached : undefined;
  const request = load().then((value) => {
    marketCache.set(key, { expiresAt: Date.now() + ttlMs, value });
    return value;
  }).catch((error) => {
    if (policy === "fallback-only" && fallback?.value !== undefined && fallback.expiresAt > Date.now()) {
      marketCache.set(key, { expiresAt: fallback.expiresAt, value: fallback.value });
      return fallback.value as T;
    }
    marketCache.delete(key);
    throw error;
  });
  marketCache.set(key, { expiresAt: fallback?.expiresAt ?? now + ttlMs, value: fallback?.value, request });
  return request;
}

function consumeMarketRateLimit(userId: string, mode: keyof typeof MARKET_RATE_LIMITS) {
  const now = Date.now();
  const key = `${userId}:${mode}`;
  const current = marketRateWindows.get(key);
  if (!current || now - current.startedAt >= MARKET_RATE_WINDOW_MS) {
    marketRateWindows.set(key, { startedAt: now, count: 1 });
    return 0;
  }
  if (current.count >= MARKET_RATE_LIMITS[mode]) {
    return Math.max(1, Math.ceil((MARKET_RATE_WINDOW_MS - (now - current.startedAt)) / 1000));
  }
  current.count += 1;
  return 0;
}

export function decimalNumber(value: number) {
  if (!Number.isFinite(value)) throw new Error("Invalid numeric quote");
  const text = String(value);
  if (!/[eE]/.test(text)) return text;
  const negative = text.startsWith("-");
  const [coefficient, exponentText] = (negative ? text.slice(1) : text).toLowerCase().split("e");
  const [whole, fraction = ""] = coefficient.split(".");
  const digits = `${whole}${fraction}`;
  const point = whole.length + Number(exponentText);
  const unsigned = point <= 0 ? `0.${"0".repeat(-point)}${digits}`
    : point >= digits.length ? `${digits}${"0".repeat(point - digits.length)}`
      : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return negative ? `-${unsigned}` : unsigned;
}

export function validateMarketAssets(value: unknown): MarketAsset[] | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { assets?: unknown }).assets)) return null;
  const assets = (value as { assets: unknown[] }).assets;
  if (assets.length === 0 || assets.length > MARKET_REQUEST_LIMIT) return null;
  const normalized: MarketAsset[] = [];
  for (const asset of assets) {
    if (!asset || typeof asset !== "object") return null;
    const row = asset as Record<string, unknown>;
    if (!(typeof row.itemId === "string" && row.itemId.length <= 100
      && ["stock", "fund", "crypto"].includes(String(row.type))
      && typeof row.symbol === "string"
      && (row.provider === undefined || MARKET_PROVIDERS.includes(row.provider as MarketProvider))
      && (row.providerAssetId === undefined || (typeof row.providerAssetId === "string" && row.providerAssetId.length <= 100))
      && (row.fallbackProvider === undefined || MARKET_PROVIDERS.includes(row.fallbackProvider as MarketProvider))
      && (row.fallbackAssetId === undefined || (typeof row.fallbackAssetId === "string" && row.fallbackAssetId.length <= 100)))) return null;
    const symbol = normalizeMarketSymbol(row.symbol);
    if (!symbol) continue;
    const type = row.type as AssetType;
    const supportedProviders = providersFor({ type });
    if ((row.provider !== undefined && !supportedProviders.includes(row.provider as MarketProvider))
      || (row.fallbackProvider !== undefined && !supportedProviders.includes(row.fallbackProvider as MarketProvider))) return null;
    normalized.push({
      itemId: row.itemId,
      type,
      symbol,
      provider: row.provider as MarketProvider | undefined,
      providerAssetId: row.providerAssetId as string | undefined,
      fallbackProvider: row.fallbackProvider as MarketProvider | undefined,
      fallbackAssetId: row.fallbackAssetId as string | undefined,
    });
  }
  return normalized.length ? normalized : null;
}

function uniqueAssets(assets: MarketAsset[]) {
  const groups = new Map<string, MarketAsset[]>();
  for (const asset of assets) {
    const key = [asset.type, asset.provider ?? "", asset.providerAssetId ?? asset.symbol, asset.fallbackProvider ?? "", asset.fallbackAssetId ?? ""].join(":").toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), asset]);
  }
  return [...groups.values()];
}

function fanOutQuotes(quotes: NormalizedQuote[], assets: MarketAsset[]) {
  return assets.flatMap((asset) => quotes.map((quote) => ({ ...quote, itemId: asset.itemId })));
}

function coinGeckoAssetId(asset: MarketAsset) {
  return asset.providerAssetId || COINGECKO_IDS[asset.symbol] || asset.symbol.toLowerCase();
}

function providersFor(asset: Pick<MarketAsset, "type">): [MarketProvider, MarketProvider] {
  return asset.type === "crypto" ? ["bybit", "coingecko"] : ["nasdaq", "yahoo"];
}

function providerRoute(asset: MarketAsset): [MarketProvider, MarketProvider] {
  const supported = providersFor(asset);
  const primary = asset.provider && supported.includes(asset.provider) ? asset.provider : supported[0];
  const fallback = asset.fallbackProvider && supported.includes(asset.fallbackProvider) && asset.fallbackProvider !== primary
    ? asset.fallbackProvider
    : supported.find((provider) => provider !== primary)!;
  return [primary, fallback];
}

function routedAsset(asset: MarketAsset, provider: MarketProvider, fallback: boolean): MarketAsset {
  return { ...asset, provider, providerAssetId: fallback ? asset.fallbackAssetId : asset.providerAssetId };
}

function quoteLoader(provider: MarketProvider) {
  if (provider === "bybit") return bybitQuote;
  if (provider === "coingecko") return coinGeckoQuote;
  if (provider === "yahoo") return yahooQuote;
  return nasdaqQuote;
}

function historyLoader(provider: MarketProvider) {
  if (provider === "bybit") return bybitHistory;
  if (provider === "coingecko") return coinGeckoHistory;
  if (provider === "yahoo") return yahooHistory;
  return nasdaqHistory;
}

async function fetchRouted(
  matching: MarketAsset[],
  cacheScope: string,
  ttlMs: number,
  load: (provider: MarketProvider, asset: MarketAsset, signal: AbortSignal) => Promise<NormalizedQuote[]>,
  cachePolicy: CachePolicy = "cache-first",
) {
  const asset = matching[0];
  const [primary, fallback] = providerRoute(asset);
  const cacheKey = [cacheScope, asset.type, primary, asset.providerAssetId ?? asset.symbol, fallback, asset.fallbackAssetId ?? ""].join(":").toLowerCase();
  try {
    const loadQuotes = async () => {
      const controller = new AbortController();
      try {
        return await Promise.any([
          load(primary, routedAsset(asset, primary, false), controller.signal),
          load(fallback, routedAsset(asset, fallback, true), controller.signal),
        ]);
      } finally {
        controller.abort();
      }
    };
    const quotes = await cachedMarketValue(cacheKey, ttlMs, loadQuotes, cachePolicy);
    return fanOutQuotes(quotes, matching);
  } catch {
    return [];
  }
}

async function bybitQuote(asset: MarketAsset, signal: AbortSignal): Promise<NormalizedQuote> {
  const symbol = (asset.providerAssetId || `${asset.symbol}USDT`).toUpperCase();
  const response = await fetchWithTimeout(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${encodeURIComponent(symbol)}`, { signal }, 8_000);
  if (!response.ok) throw new Error("Bybit unavailable");
  const body = await response.json() as { retCode?: number; result?: { list?: Array<{ lastPrice?: string }> }; time?: number };
  const price = body.result?.list?.[0]?.lastPrice;
  if (body.retCode !== 0 || !price || !/^\d+(\.\d+)?$/.test(price)) throw new Error("Invalid Bybit quote");
  return { itemId: asset.itemId, price, currency: "USD", provider: "bybit", quotedAt: new Date(body.time ?? Date.now()).toISOString() };
}

async function coinGeckoQuote(asset: MarketAsset, signal: AbortSignal): Promise<NormalizedQuote> {
  const id = coinGeckoAssetId(asset);
  const response = await fetchWithTimeout(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_last_updated_at=true`, { signal }, 8_000);
  if (!response.ok) throw new Error("CoinGecko unavailable");
  const body = await response.json() as Record<string, { usd?: number; last_updated_at?: number }>;
  const quote = body[id];
  if (!quote || typeof quote.usd !== "number" || !Number.isFinite(quote.usd)) throw new Error("Invalid CoinGecko quote");
  return { itemId: asset.itemId, price: decimalNumber(quote.usd), currency: "USD", provider: "coingecko", quotedAt: new Date((quote.last_updated_at ?? Date.now() / 1000) * 1000).toISOString() };
}

function nasdaqAssetClass(asset: MarketAsset) {
  return asset.type === "fund" ? "etf" : "stocks";
}

function parseNasdaqPrice(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/[$,\s]/g, "");
  return /^\d+(\.\d+)?$/.test(normalized) ? normalized : undefined;
}

function parseNasdaqDate(value: unknown) {
  if (typeof value !== "string") return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

async function nasdaqQuote(asset: MarketAsset, signal: AbortSignal): Promise<NormalizedQuote> {
  const symbol = (asset.providerAssetId || asset.symbol).toUpperCase();
  const response = await fetchWithTimeout(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/info?assetclass=${nasdaqAssetClass(asset)}`, { headers: NASDAQ_HEADERS, signal }, 8_000);
  if (!response.ok) throw new Error("Nasdaq unavailable");
  const body = await response.json() as { data?: { primaryData?: { lastSalePrice?: string; lastTradeTimestamp?: string } }; status?: { rCode?: number } };
  const price = parseNasdaqPrice(body.data?.primaryData?.lastSalePrice);
  if (body.status?.rCode !== 200 || !price) throw new Error("Invalid Nasdaq quote");
  return { itemId: asset.itemId, price, currency: "USD", provider: "nasdaq", quotedAt: parseNasdaqDate(body.data?.primaryData?.lastTradeTimestamp) ?? new Date().toISOString() };
}

async function yahooQuote(asset: MarketAsset, signal: AbortSignal): Promise<NormalizedQuote> {
  const symbol = (asset.providerAssetId || asset.symbol).toUpperCase();
  const response = await fetchWithTimeout(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`, { signal }, 8_000);
  if (!response.ok) throw new Error("Yahoo Finance unavailable");
  const body = await response.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; regularMarketTime?: number } }>; error?: unknown } };
  const meta = body.chart?.result?.[0]?.meta;
  if (body.chart?.error || typeof meta?.regularMarketPrice !== "number" || !Number.isFinite(meta.regularMarketPrice)) throw new Error("Invalid Yahoo Finance quote");
  return { itemId: asset.itemId, price: decimalNumber(meta.regularMarketPrice), currency: "USD", provider: "yahoo", quotedAt: new Date((meta.regularMarketTime ?? Date.now() / 1000) * 1000).toISOString() };
}

export async function fetchMarketQuotes(assets: MarketAsset[]) {
  return (await Promise.all(uniqueAssets(assets).map((matching) => fetchRouted(
    matching,
    "quote",
    QUOTE_FALLBACK_MAX_AGE_MS,
    async (provider, asset, signal) => [await quoteLoader(provider)(asset, signal)],
    "fallback-only",
  )))).flat();
}

async function bybitHistory(asset: MarketAsset, startDate: string, signal: AbortSignal): Promise<NormalizedQuote[]> {
  const symbol = (asset.providerAssetId || `${asset.symbol}USDT`).toUpperCase();
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const response = await fetchWithTimeout(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${encodeURIComponent(symbol)}&interval=D&start=${start}&limit=1000`, { signal }, 12_000);
  if (!response.ok) throw new Error("Bybit history unavailable");
  const body = await response.json() as { retCode?: number; result?: { list?: string[][] } };
  if (body.retCode !== 0 || !Array.isArray(body.result?.list)) throw new Error("Invalid Bybit history");
  return body.result.list.flatMap((row) => row[0] && row[4] && /^\d+(\.\d+)?$/.test(row[4]) ? [{ itemId: asset.itemId, price: row[4], currency: "USD" as const, provider: "bybit", quotedAt: new Date(Number(row[0])).toISOString() }] : []);
}

async function coinGeckoHistory(asset: MarketAsset, startDate: string, signal: AbortSignal): Promise<NormalizedQuote[]> {
  const id = coinGeckoAssetId(asset);
  const from = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000);
  const to = Math.floor(Date.now() / 1000);
  const response = await fetchWithTimeout(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`, { signal }, 12_000);
  if (!response.ok) throw new Error("CoinGecko history unavailable");
  const body = await response.json() as { prices?: Array<[number, number]> };
  if (!Array.isArray(body.prices)) throw new Error("Invalid CoinGecko history");
  const byDay = new Map<string, NormalizedQuote>();
  for (const [timestamp, price] of body.prices) if (Number.isFinite(price)) byDay.set(new Date(timestamp).toISOString().slice(0, 10), { itemId: asset.itemId, price: decimalNumber(price), currency: "USD", provider: "coingecko", quotedAt: new Date(timestamp).toISOString() });
  return [...byDay.values()];
}

async function nasdaqHistory(asset: MarketAsset, startDate: string, signal: AbortSignal): Promise<NormalizedQuote[]> {
  const symbol = (asset.providerAssetId || asset.symbol).toUpperCase();
  const endDate = new Date().toISOString().slice(0, 10);
  const response = await fetchWithTimeout(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/historical?assetclass=${nasdaqAssetClass(asset)}&fromdate=${startDate}&todate=${endDate}&limit=5000`, { headers: NASDAQ_HEADERS, signal }, 12_000);
  if (!response.ok) throw new Error("Nasdaq history unavailable");
  const body = await response.json() as { data?: { tradesTable?: { rows?: Array<{ date?: string; close?: string }> | null } }; status?: { rCode?: number } };
  if (body.status?.rCode !== 200) throw new Error("Invalid Nasdaq history");
  return (body.data?.tradesTable?.rows ?? []).flatMap((row) => {
    const price = parseNasdaqPrice(row.close);
    if (!row.date || !price) return [];
    const [month, day, year] = row.date.split("/");
    return year && month && day ? [{ itemId: asset.itemId, price, currency: "USD" as const, provider: "nasdaq", quotedAt: `${year}-${month}-${day}T21:00:00.000Z` }] : [];
  });
}

async function yahooHistory(asset: MarketAsset, startDate: string, signal: AbortSignal): Promise<NormalizedQuote[]> {
  const symbol = (asset.providerAssetId || asset.symbol).toUpperCase();
  const period1 = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000);
  const period2 = Math.floor(Date.now() / 1000);
  const response = await fetchWithTimeout(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`, { signal }, 12_000);
  if (!response.ok) throw new Error("Yahoo Finance history unavailable");
  const body = await response.json() as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }>; error?: unknown } };
  const result = body.chart?.result?.[0];
  if (body.chart?.error || !result?.timestamp) throw new Error("Invalid Yahoo Finance history");
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  return result.timestamp.flatMap((timestamp, index) => typeof closes[index] === "number" && Number.isFinite(closes[index]) ? [{ itemId: asset.itemId, price: decimalNumber(closes[index]), currency: "USD" as const, provider: "yahoo", quotedAt: new Date(timestamp * 1000).toISOString() }] : []);
}

export async function fetchMarketHistory(assets: MarketAsset[], startDate: string) {
  return (await Promise.all(uniqueAssets(assets).map((matching) => fetchRouted(
    matching,
    `history:${startDate}`,
    HISTORY_CACHE_TTL_MS,
    (provider, asset, signal) => historyLoader(provider)(asset, startDate, signal),
  )))).flat();
}

export async function searchMarketAssets(query: string, type?: AssetType): Promise<MarketSearchResult[]> {
  const cacheKey = `search:${type ?? "all"}:${query.trim().toLowerCase()}`;
  return cachedMarketValue(cacheKey, SEARCH_CACHE_TTL_MS, async () => {
    const cryptoRequest = type && type !== "crypto" ? Promise.resolve([]) : fetchWithTimeout(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`, {}, 8_000).then(async (response) => {
      if (!response.ok) return [];
      const body = await response.json() as { coins?: Array<{ id?: string; name?: string; symbol?: string; market_cap_rank?: number }> };
      return (body.coins ?? []).flatMap((coin) => {
        const symbol = normalizeMarketSymbol(coin.symbol);
        return coin.id && coin.name && symbol ? [{ name: coin.name, symbol, type: "crypto" as const, provider: "coingecko" as const, providerAssetId: coin.id, rank: coin.market_cap_rank ?? Number.MAX_SAFE_INTEGER }] : [];
      }).slice(0, 6);
    }).catch(() => []);
    const securityRequest = type === "crypto" ? Promise.resolve([]) : fetchWithTimeout(`https://api.nasdaq.com/api/autocomplete/slookup/10?search=${encodeURIComponent(query)}`, { headers: NASDAQ_HEADERS }, 8_000).then(async (response) => {
      if (!response.ok) return [];
      const body = await response.json() as { data?: Array<{ symbol?: string; name?: string; asset?: string }> };
      return (body.data ?? []).flatMap((asset) => {
        const symbol = normalizeMarketSymbol(asset.symbol);
        const assetType = asset.asset === "STOCKS" ? "stock" as const : ["ETF", "MUTUALFUNDS"].includes(asset.asset ?? "") ? "fund" as const : undefined;
        return asset.name && symbol && assetType && (!type || assetType === type)
          ? [{ name: asset.name.trim(), symbol, type: assetType, provider: "nasdaq" as const, providerAssetId: symbol }]
          : [];
      });
    }).catch(() => []);
    const yahooRequest = type === "crypto" ? Promise.resolve([]) : fetchWithTimeout(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`, {}, 8_000).then(async (response) => {
      if (!response.ok) return [];
      const body = await response.json() as { quotes?: Array<{ symbol?: string; longname?: string; shortname?: string; quoteType?: string }> };
      return (body.quotes ?? []).flatMap((asset) => {
        const symbol = normalizeMarketSymbol(asset.symbol);
        const assetType = asset.quoteType === "EQUITY" ? "stock" as const : asset.quoteType === "ETF" || asset.quoteType === "MUTUALFUND" ? "fund" as const : undefined;
        const name = asset.longname?.trim() || asset.shortname?.trim();
        return name && symbol && assetType && (!type || assetType === type)
          ? [{ name, symbol, type: assetType, provider: "yahoo" as const, providerAssetId: symbol }]
          : [];
      });
    }).catch(() => []);
    const [crypto, nasdaqSecurities, yahooSecurities] = await Promise.all([cryptoRequest, securityRequest, yahooRequest]);
    const rankedCrypto = crypto.sort((a, b) => a.rank - b.rank).map((asset) => ({ name: asset.name, symbol: asset.symbol, type: asset.type, provider: asset.provider, providerAssetId: asset.providerAssetId }));
    const securities = new Map<string, MarketSearchResult>();
    for (const asset of [...yahooSecurities, ...nasdaqSecurities]) if (!securities.has(`${asset.type}:${asset.symbol}`)) securities.set(`${asset.type}:${asset.symbol}`, asset);
    return [...rankedCrypto, ...securities.values()].slice(0, 10);
  });
}

export async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  if (request.method === "OPTIONS") { response.status(204).end(); return; }
  if (request.method !== "POST") { response.status(405).json({ error: "Method not allowed" }); return; }
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const userId = token && url && key ? await getAuthenticatedUserId(url, key, token) : null;
  if (!userId) { response.status(401).json({ error: "Unauthorized" }); return; }
  const mode = request.body && typeof request.body === "object" ? (request.body as { mode?: unknown }).mode : undefined;
  if (mode === "search") {
    const { query, type } = request.body as { query?: unknown; type?: unknown };
    if (typeof query !== "string" || query.trim().length < 2 || query.trim().length > 50) { response.status(400).json({ error: "Invalid search query" }); return; }
    if (type !== "stock" && type !== "fund" && type !== "crypto") { response.status(400).json({ error: "Invalid asset type" }); return; }
    const retryAfter = consumeMarketRateLimit(userId, "search");
    if (retryAfter) { response.setHeader("Retry-After", String(retryAfter)); response.status(429).json({ error: "Too many market requests" }); return; }
    try { response.status(200).json({ assets: await searchMarketAssets(query.trim(), type) }); }
    catch { response.status(503).json({ error: "Market data unavailable" }); }
    return;
  }
  const assets = validateMarketAssets(request.body);
  if (!assets) { response.status(400).json({ error: "Invalid market request" }); return; }
  const startDate = (request.body as { startDate?: unknown }).startDate;
  if (mode === "history") {
    if (typeof startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) { response.status(400).json({ error: "Invalid history range" }); return; }
    const retryAfter = consumeMarketRateLimit(userId, "history");
    if (retryAfter) { response.setHeader("Retry-After", String(retryAfter)); response.status(429).json({ error: "Too many market requests" }); return; }
    try { response.status(200).json({ quotes: await fetchMarketHistory(assets, startDate) }); }
    catch { response.status(503).json({ error: "Market data unavailable" }); }
    return;
  }
  const retryAfter = consumeMarketRateLimit(userId, "quotes");
  if (retryAfter) { response.setHeader("Retry-After", String(retryAfter)); response.status(429).json({ error: "Too many market requests" }); return; }
  try { response.status(200).json({ quotes: await fetchMarketQuotes(assets) }); }
  catch { response.status(503).json({ error: "Market data unavailable" }); }
}

async function fetchHandler(request: Request) {
  let body: unknown;
  if (request.method === "POST") {
    try { body = await request.json(); }
    catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  }
  let status = 200;
  let responseBody: unknown;
  const headers = new Headers();
  const adapter: ApiResponse = {
    status(code) { status = code; return adapter; },
    json(payload) { responseBody = payload; },
    setHeader(name, value) { headers.set(name, value); },
    end() {},
  };
  await handler({ method: request.method, headers: { authorization: request.headers.get("authorization") ?? undefined }, body }, adapter);
  if (responseBody === undefined) return new Response(null, { status, headers });
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(responseBody), { status, headers });
}

export default { fetch: fetchHandler };
