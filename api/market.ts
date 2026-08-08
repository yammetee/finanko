import { isAuthenticatedUser } from "./serverAuth";

type AssetType = "stock" | "fund" | "crypto";
interface MarketAsset { itemId: string; type: AssetType; symbol: string; provider?: string; providerAssetId?: string; fallbackProvider?: string; fallbackAssetId?: string }
interface ApiRequest { method?: string; headers: { authorization?: string }; body?: unknown }
interface ApiResponse { status(code: number): ApiResponse; json(payload: unknown): void; setHeader(name: string, value: string): void; end(): void }
export interface NormalizedQuote { itemId: string; price: string; currency: "USD"; provider: string; quotedAt: string }

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
      && (row.provider === undefined || ["bybit", "coingecko", "twelve_data"].includes(String(row.provider)))
      && (row.providerAssetId === undefined || (typeof row.providerAssetId === "string" && row.providerAssetId.length <= 100))
      && (row.fallbackProvider === undefined || ["bybit", "coingecko", "twelve_data"].includes(String(row.fallbackProvider)))
      && (row.fallbackAssetId === undefined || (typeof row.fallbackAssetId === "string" && row.fallbackAssetId.length <= 100));
  })) return null;
  return assets as MarketAsset[];
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

async function twelveDataQuotes(assets: MarketAsset[], apiKey: string): Promise<NormalizedQuote[]> {
  if (!assets.length) return [];
  const symbols = [...new Set(assets.map((asset) => asset.providerAssetId || asset.symbol))];
  const response = await fetch(`https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbols.join(","))}`, { headers: { Authorization: `apikey ${apiKey}` } });
  if (!response.ok) throw new Error("Twelve Data unavailable");
  const body = await response.json() as Record<string, { price?: string }> | { price?: string };
  return assets.flatMap((asset) => {
    const symbol = asset.providerAssetId || asset.symbol;
    const value = symbols.length === 1 ? (body as { price?: string }).price : (body as Record<string, { price?: string }>)[symbol]?.price;
    return value && /^\d+(\.\d+)?$/.test(value) ? [{ itemId: asset.itemId, price: value, currency: "USD" as const, provider: "twelve_data", quotedAt: new Date().toISOString() }] : [];
  });
}

export async function fetchMarketQuotes(assets: MarketAsset[], twelveDataKey?: string) {
  const crypto = assets.filter((asset) => asset.type === "crypto");
  const securities = assets.filter((asset) => asset.type !== "crypto");
  const cryptoQuotes = await Promise.all(crypto.map(async (asset) => {
    const primary = asset.provider === "coingecko" ? coinGeckoQuote : bybitQuote;
    const fallback = asset.provider === "coingecko" ? bybitQuote : coinGeckoQuote;
    const fallbackAsset = { ...asset, provider: asset.fallbackProvider, providerAssetId: asset.fallbackAssetId };
    try { return await primary(asset); } catch { try { return await fallback(fallbackAsset); } catch { return null; } }
  }));
  const securityQuotes = twelveDataKey ? await twelveDataQuotes(securities, twelveDataKey).catch(() => []) : [];
  return [...cryptoQuotes.filter((quote): quote is NormalizedQuote => quote !== null), ...securityQuotes];
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
  const assets = validateMarketAssets(request.body);
  if (!assets) { response.status(400).json({ error: "Invalid market request" }); return; }
  const quotes = await fetchMarketQuotes(assets, process.env.TWELVE_DATA_API_KEY);
  response.status(200).json({ quotes });
}
