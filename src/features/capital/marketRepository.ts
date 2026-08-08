import { getSupabaseClient } from "../../shared/api/supabase";
import { MARKET_REQUEST_LIMIT, normalizeMarketSymbol } from "./marketContract";
import type { CapitalAssetSuggestion, CapitalItem, CapitalQuote } from "./capitalTypes";

interface MarketRequestAsset {
  itemId: string;
  type: "stock" | "fund" | "crypto";
  symbol: string;
  provider?: CapitalItem["primaryProvider"];
  providerAssetId?: string;
  fallbackProvider?: CapitalItem["fallbackProvider"];
  fallbackAssetId?: string;
}

async function marketAccessToken() {
  const client = await getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured");
  const token = (await client.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error("Authentication required");
  return token;
}

async function marketRequest<T>(token: string, body: Record<string, unknown>, errorMessage: string): Promise<T> {
  const response = await fetch("/api/market", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(errorMessage);
  return response.json() as Promise<T>;
}

function marketAssets(items: CapitalItem[]): MarketRequestAsset[] {
  return items.flatMap((item) => {
    if (item.type !== "stock" && item.type !== "fund" && item.type !== "crypto") return [];
    const symbol = normalizeMarketSymbol(item.symbol);
    return symbol ? [{
      itemId: item.id,
      type: item.type,
      symbol,
      provider: item.primaryProvider,
      providerAssetId: item.primaryAssetId,
      fallbackProvider: item.fallbackProvider,
      fallbackAssetId: item.fallbackAssetId,
    }] : [];
  });
}

function chunks<T>(values: T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

async function loadMarketData(items: CapitalItem[], mode?: "history", startDate?: string): Promise<CapitalQuote[]> {
  const assets = marketAssets(items);
  if (!assets.length) return [];
  const token = await marketAccessToken();
  const responses: Array<{ quotes?: CapitalQuote[] }> = [];
  let requestError: unknown;
  for (const batch of chunks(assets, MARKET_REQUEST_LIMIT)) {
    try {
      responses.push(await marketRequest(token, { mode, startDate, assets: batch }, "Market data unavailable"));
    } catch (error) {
      requestError ??= error;
    }
  }
  if (!responses.length) throw requestError ?? new Error("Market data unavailable");
  return responses.flatMap((body) => Array.isArray(body.quotes) ? body.quotes : []);
}

export function loadMarketQuotes(items: CapitalItem[]) {
  return loadMarketData(items);
}

export function loadMarketHistory(items: CapitalItem[], startDate: string) {
  return loadMarketData(items, "history", startDate);
}

export async function searchMarketAssets(query: string): Promise<CapitalAssetSuggestion[]> {
  const token = await marketAccessToken();
  const body = await marketRequest<{ assets?: CapitalAssetSuggestion[] }>(token, { mode: "search", query }, "Asset search unavailable");
  return Array.isArray(body.assets) ? body.assets : [];
}
