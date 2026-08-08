import { isAuthenticatedUser } from "./serverAuth";

type AssetType = "stock" | "fund" | "crypto";
interface MarketAsset { itemId: string; type: AssetType; symbol: string; provider?: string; providerAssetId?: string; fallbackProvider?: string; fallbackAssetId?: string }
interface ApiRequest { method?: string; headers: { authorization?: string }; body?: unknown }
interface ApiResponse { status(code: number): ApiResponse; json(payload: unknown): void; setHeader(name: string, value: string): void; end(): void }
export interface NormalizedQuote { itemId: string; price: string; currency: "USD"; provider: string; quotedAt: string }
export interface MarketSearchResult { name: string; symbol: string; type: AssetType; provider: "coingecko" | "nasdaq"; providerAssetId: string }

const NASDAQ_HEADERS = { Accept: "application/json, text/plain, */*", "User-Agent": "Mozilla/5.0 (compatible; Finanko/1.0)" };

export function validateMarketAssets(value: unknown): MarketAsset[] | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { assets?: unknown }).assets)) return null;
  const assets = (value as { assets: unknown[] }).assets;
  if (assets.length === 0 || assets.length > 30) return null;
  if (!assets.every((asset) => {
    if (!asset || typeof asset !== "object") return false;
    const row = asset as Record<string, unknown>;
    return typeof row.itemId === "string" && row.itemId.length <= 100
      && ["stock", "fund", "crypto"].includes(String(row.type))
      && typeof row.symbol === "string" && /^[A-Za-z0-9._-]{1,32}$/.test(row.symbol)
      && (row.provider === undefined || ["bybit", "coingecko", "nasdaq", "yahoo"].includes(String(row.provider)))
      && (row.providerAssetId === undefined || (typeof row.providerAssetId === "string" && row.providerAssetId.length <= 100))
      && (row.fallbackProvider === undefined || ["bybit", "coingecko", "nasdaq", "yahoo"].includes(String(row.fallbackProvider)))
      && (row.fallbackAssetId === undefined || (typeof row.fallbackAssetId === "string" && row.fallbackAssetId.length <= 100));
  })) return null;
  return assets as MarketAsset[];
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

async function bybitQuote(asset: MarketAsset): Promise<NormalizedQuote> {
  const symbol = (asset.providerAssetId || `${asset.symbol}USDT`).toUpperCase();
  const response = await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${encodeURIComponent(symbol)}`);
  if (!response.ok) throw new Error("Bybit unavailable");
  const body = await response.json() as { retCode?: number; result?: { list?: Array<{ lastPrice?: string }> }; time?: number };
  const price = body.result?.list?.[0]?.lastPrice;
  if (body.retCode !== 0 || !price || !/^\d+(\.\d+)?$/.test(price)) throw new Error("Invalid Bybit quote");
  return { itemId: asset.itemId, price, currency: "USD", provider: "bybit", quotedAt: new Date(body.time ?? Date.now()).toISOString() };
}

async function coinGeckoQuote(asset: MarketAsset): Promise<NormalizedQuote> {
  const knownIds: Record<string, string> = { BTC: "bitcoin", ETH: "ethereum", SOL: "solana", USDT: "tether", USDC: "usd-coin" };
  const id = asset.providerAssetId || knownIds[asset.symbol.toUpperCase()] || asset.symbol.toLowerCase();
  const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_last_updated_at=true`);
  if (!response.ok) throw new Error("CoinGecko unavailable");
  const body = await response.json() as Record<string, { usd?: number; last_updated_at?: number }>;
  const quote = body[id];
  if (!quote || typeof quote.usd !== "number" || !Number.isFinite(quote.usd)) throw new Error("Invalid CoinGecko quote");
  return { itemId: asset.itemId, price: String(quote.usd), currency: "USD", provider: "coingecko", quotedAt: new Date((quote.last_updated_at ?? Date.now() / 1000) * 1000).toISOString() };
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

async function nasdaqQuote(asset: MarketAsset): Promise<NormalizedQuote> {
  const symbol = (asset.providerAssetId || asset.symbol).toUpperCase();
  const response = await fetch(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/info?assetclass=${nasdaqAssetClass(asset)}`, { headers: NASDAQ_HEADERS });
  if (!response.ok) throw new Error("Nasdaq unavailable");
  const body = await response.json() as { data?: { primaryData?: { lastSalePrice?: string; lastTradeTimestamp?: string } }; status?: { rCode?: number } };
  const price = parseNasdaqPrice(body.data?.primaryData?.lastSalePrice);
  if (body.status?.rCode !== 200 || !price) throw new Error("Invalid Nasdaq quote");
  return { itemId: asset.itemId, price, currency: "USD", provider: "nasdaq", quotedAt: parseNasdaqDate(body.data?.primaryData?.lastTradeTimestamp) ?? new Date().toISOString() };
}

async function yahooQuote(asset: MarketAsset): Promise<NormalizedQuote> {
  const symbol = (asset.providerAssetId || asset.symbol).toUpperCase();
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`);
  if (!response.ok) throw new Error("Yahoo Finance unavailable");
  const body = await response.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; regularMarketTime?: number } }>; error?: unknown } };
  const meta = body.chart?.result?.[0]?.meta;
  if (body.chart?.error || typeof meta?.regularMarketPrice !== "number" || !Number.isFinite(meta.regularMarketPrice)) throw new Error("Invalid Yahoo Finance quote");
  return { itemId: asset.itemId, price: String(meta.regularMarketPrice), currency: "USD", provider: "yahoo", quotedAt: new Date((meta.regularMarketTime ?? Date.now() / 1000) * 1000).toISOString() };
}

export async function fetchMarketQuotes(assets: MarketAsset[]) {
  const crypto = assets.filter((asset) => asset.type === "crypto");
  const securities = assets.filter((asset) => asset.type !== "crypto");
  const cryptoQuotes = await Promise.all(uniqueAssets(crypto).map(async (matching) => {
    const asset = matching[0];
    const primary = asset.provider === "coingecko" ? coinGeckoQuote : bybitQuote;
    const fallback = asset.provider === "coingecko" ? bybitQuote : coinGeckoQuote;
    const fallbackAsset = { ...asset, provider: asset.fallbackProvider, providerAssetId: asset.fallbackAssetId };
    try { return fanOutQuotes([await primary(asset)], matching); } catch { try { return fanOutQuotes([await fallback(fallbackAsset)], matching); } catch { return []; } }
  }));
  const securityQuotes = (await Promise.all(uniqueAssets(securities).map(async (matching) => {
    const asset = matching[0];
    const primary = asset.provider === "yahoo" ? yahooQuote : nasdaqQuote;
    const fallback = asset.fallbackProvider === "nasdaq" ? nasdaqQuote : yahooQuote;
    const fallbackAsset = { ...asset, provider: asset.fallbackProvider, providerAssetId: asset.fallbackAssetId };
    try { return fanOutQuotes([await primary(asset)], matching); } catch { try { return fanOutQuotes([await fallback(fallbackAsset)], matching); } catch { return []; } }
  }))).flat();
  return [...cryptoQuotes.flat(), ...securityQuotes];
}

async function bybitHistory(asset: MarketAsset, startDate: string): Promise<NormalizedQuote[]> {
  const symbol = (asset.providerAssetId || `${asset.symbol}USDT`).toUpperCase();
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const response = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${encodeURIComponent(symbol)}&interval=D&start=${start}&limit=1000`);
  if (!response.ok) throw new Error("Bybit history unavailable");
  const body = await response.json() as { retCode?: number; result?: { list?: string[][] } };
  if (body.retCode !== 0 || !Array.isArray(body.result?.list)) throw new Error("Invalid Bybit history");
  return body.result.list.flatMap((row) => row[0] && row[4] && /^\d+(\.\d+)?$/.test(row[4]) ? [{ itemId: asset.itemId, price: row[4], currency: "USD" as const, provider: "bybit", quotedAt: new Date(Number(row[0])).toISOString() }] : []);
}

async function coinGeckoHistory(asset: MarketAsset, startDate: string): Promise<NormalizedQuote[]> {
  const knownIds: Record<string, string> = { BTC: "bitcoin", ETH: "ethereum", SOL: "solana", USDT: "tether", USDC: "usd-coin" };
  const id = asset.providerAssetId || knownIds[asset.symbol.toUpperCase()] || asset.symbol.toLowerCase();
  const from = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000);
  const to = Math.floor(Date.now() / 1000);
  const response = await fetch(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`);
  if (!response.ok) throw new Error("CoinGecko history unavailable");
  const body = await response.json() as { prices?: Array<[number, number]> };
  if (!Array.isArray(body.prices)) throw new Error("Invalid CoinGecko history");
  const byDay = new Map<string, NormalizedQuote>();
  for (const [timestamp, price] of body.prices) if (Number.isFinite(price)) byDay.set(new Date(timestamp).toISOString().slice(0, 10), { itemId: asset.itemId, price: String(price), currency: "USD", provider: "coingecko", quotedAt: new Date(timestamp).toISOString() });
  return [...byDay.values()];
}

async function nasdaqHistory(asset: MarketAsset, startDate: string): Promise<NormalizedQuote[]> {
  const symbol = (asset.providerAssetId || asset.symbol).toUpperCase();
  const endDate = new Date().toISOString().slice(0, 10);
  const response = await fetch(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/historical?assetclass=${nasdaqAssetClass(asset)}&fromdate=${startDate}&todate=${endDate}&limit=5000`, { headers: NASDAQ_HEADERS });
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

async function yahooHistory(asset: MarketAsset, startDate: string): Promise<NormalizedQuote[]> {
  const symbol = (asset.providerAssetId || asset.symbol).toUpperCase();
  const period1 = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000);
  const period2 = Math.floor(Date.now() / 1000);
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`);
  if (!response.ok) throw new Error("Yahoo Finance history unavailable");
  const body = await response.json() as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }>; error?: unknown } };
  const result = body.chart?.result?.[0];
  if (body.chart?.error || !result?.timestamp) throw new Error("Invalid Yahoo Finance history");
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  return result.timestamp.flatMap((timestamp, index) => typeof closes[index] === "number" && Number.isFinite(closes[index]) ? [{ itemId: asset.itemId, price: String(closes[index]), currency: "USD" as const, provider: "yahoo", quotedAt: new Date(timestamp * 1000).toISOString() }] : []);
}

export async function fetchMarketHistory(assets: MarketAsset[], startDate: string) {
  const crypto = assets.filter((asset) => asset.type === "crypto");
  const securities = assets.filter((asset) => asset.type !== "crypto");
  const cryptoHistory = (await Promise.all(uniqueAssets(crypto).map(async (matching) => {
    const asset = matching[0];
    const primary = asset.provider === "coingecko" ? coinGeckoHistory : bybitHistory;
    const fallback = asset.provider === "coingecko" ? bybitHistory : coinGeckoHistory;
    const fallbackAsset = { ...asset, provider: asset.fallbackProvider, providerAssetId: asset.fallbackAssetId };
    try { return fanOutQuotes(await primary(asset, startDate), matching); } catch { try { return fanOutQuotes(await fallback(fallbackAsset, startDate), matching); } catch { return []; } }
  }))).flat();
  const securityHistory = (await Promise.all(uniqueAssets(securities).map(async (matching) => {
    const asset = matching[0];
    const primary = asset.provider === "yahoo" ? yahooHistory : nasdaqHistory;
    const fallback = asset.fallbackProvider === "nasdaq" ? nasdaqHistory : yahooHistory;
    const fallbackAsset = { ...asset, provider: asset.fallbackProvider, providerAssetId: asset.fallbackAssetId };
    try { return fanOutQuotes(await primary(asset, startDate), matching); } catch { try { return fanOutQuotes(await fallback(fallbackAsset, startDate), matching); } catch { return []; } }
  }))).flat();
  return [...cryptoHistory, ...securityHistory];
}

export async function searchMarketAssets(query: string): Promise<MarketSearchResult[]> {
  const cryptoRequest = fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`).then(async (response) => {
    if (!response.ok) return [];
    const body = await response.json() as { coins?: Array<{ id?: string; name?: string; symbol?: string; market_cap_rank?: number }> };
    return (body.coins ?? []).filter((coin) => coin.id && coin.name && coin.symbol).slice(0, 6).map((coin) => ({ name: coin.name!, symbol: coin.symbol!.toUpperCase(), type: "crypto" as const, provider: "coingecko" as const, providerAssetId: coin.id!, rank: coin.market_cap_rank ?? Number.MAX_SAFE_INTEGER }));
  }).catch(() => []);
  const securityRequest = fetch(`https://api.nasdaq.com/api/autocomplete/slookup/10?search=${encodeURIComponent(query)}`, { headers: NASDAQ_HEADERS }).then(async (response) => {
    if (!response.ok) return [];
    const body = await response.json() as { data?: Array<{ symbol?: string; name?: string; asset?: string }> };
    return (body.data ?? []).filter((asset) => asset.symbol && asset.name && ["STOCKS", "ETF", "MUTUALFUNDS"].includes(asset.asset ?? "")).map((asset) => ({ name: asset.name!.trim(), symbol: asset.symbol!, type: asset.asset === "STOCKS" ? "stock" as const : "fund" as const, provider: "nasdaq" as const, providerAssetId: asset.symbol! }));
  }).catch(() => []);
  const [crypto, securities] = await Promise.all([cryptoRequest, securityRequest]);
  const rankedCrypto = crypto.sort((a, b) => a.rank - b.rank).map((asset) => ({ name: asset.name, symbol: asset.symbol, type: asset.type, provider: asset.provider, providerAssetId: asset.providerAssetId }));
  return [...rankedCrypto, ...securities].slice(0, 10);
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  if (request.method === "OPTIONS") { response.status(204).end(); return; }
  if (request.method !== "POST") { response.status(405).json({ error: "Method not allowed" }); return; }
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !key || !await isAuthenticatedUser(url, key, token)) { response.status(401).json({ error: "Unauthorized" }); return; }
  const mode = request.body && typeof request.body === "object" ? (request.body as { mode?: unknown }).mode : undefined;
  if (mode === "search") {
    const query = (request.body as { query?: unknown }).query;
    if (typeof query !== "string" || query.trim().length < 2 || query.trim().length > 50) { response.status(400).json({ error: "Invalid search query" }); return; }
    response.status(200).json({ assets: await searchMarketAssets(query.trim()) });
    return;
  }
  const assets = validateMarketAssets(request.body);
  if (!assets) { response.status(400).json({ error: "Invalid market request" }); return; }
  const startDate = (request.body as { startDate?: unknown }).startDate;
  if (mode === "history") {
    if (typeof startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) { response.status(400).json({ error: "Invalid history range" }); return; }
    response.status(200).json({ quotes: await fetchMarketHistory(assets, startDate) });
    return;
  }
  const quotes = await fetchMarketQuotes(assets);
  response.status(200).json({ quotes });
}
