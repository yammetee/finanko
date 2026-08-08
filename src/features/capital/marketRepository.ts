import { getSupabaseClient } from "../../shared/api/supabase";
import type { CapitalItem, CapitalQuote } from "./capitalTypes";

export async function loadMarketQuotes(items: CapitalItem[]): Promise<CapitalQuote[]> {
  const assets = items.filter((item) => (item.type === "stock" || item.type === "fund" || item.type === "crypto") && item.symbol).map((item) => ({ itemId: item.id, type: item.type, symbol: item.symbol!, provider: item.primaryProvider, providerAssetId: item.primaryAssetId, fallbackProvider: item.fallbackProvider, fallbackAssetId: item.fallbackAssetId }));
  if (!assets.length) return [];
  const client = await getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured");
  const token = (await client.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error("Authentication required");
  const response = await fetch("/api/market", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ assets }) });
  if (!response.ok) throw new Error("Market quotes unavailable");
  const body = await response.json() as { quotes?: CapitalQuote[] };
  return Array.isArray(body.quotes) ? body.quotes : [];
}
