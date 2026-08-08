import { getSupabaseClient } from "../../shared/api/supabase";
import type { CapitalAssetSuggestion, CapitalItem, CapitalQuote } from "./capitalTypes";

async function authenticatedMarketRequest(items: CapitalItem[], mode?: "history", startDate?: string) {
  const assets = items.filter((item) => (item.type === "stock" || item.type === "fund" || item.type === "crypto") && item.symbol).map((item) => ({ itemId: item.id, type: item.type, symbol: item.symbol!, provider: item.primaryProvider, providerAssetId: item.primaryAssetId, fallbackProvider: item.fallbackProvider, fallbackAssetId: item.fallbackAssetId }));
  if (!assets.length) return undefined;
  const client = await getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured");
  const token = (await client.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error("Authentication required");
  const response = await fetch("/api/market", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ mode, startDate, assets }) });
  if (!response.ok) throw new Error("Market data unavailable");
  return response.json() as Promise<Record<string, unknown>>;
}

export async function loadMarketQuotes(items: CapitalItem[]): Promise<CapitalQuote[]> {
  const body = await authenticatedMarketRequest(items) as { quotes?: CapitalQuote[] } | undefined;
  return Array.isArray(body?.quotes) ? body.quotes : [];
}

export async function loadMarketHistory(items: CapitalItem[], startDate: string): Promise<CapitalQuote[]> {
  const body = await authenticatedMarketRequest(items, "history", startDate) as { quotes?: CapitalQuote[] } | undefined;
  return Array.isArray(body?.quotes) ? body.quotes : [];
}

export async function searchMarketAssets(query: string): Promise<CapitalAssetSuggestion[]> {
  const client = await getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured");
  const token = (await client.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error("Authentication required");
  const response = await fetch("/api/market", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ mode: "search", query }) });
  if (!response.ok) throw new Error("Asset search unavailable");
  const body = await response.json() as { assets?: CapitalAssetSuggestion[] };
  return Array.isArray(body.assets) ? body.assets : [];
}
