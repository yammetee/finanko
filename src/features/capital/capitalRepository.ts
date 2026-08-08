import { getSupabaseClient } from "../../shared/api/supabase";
import type { CapitalEvent, CapitalGroup, CapitalItem, CapitalSnapshot } from "./capitalTypes";

type Row = Record<string, unknown>;

async function client() {
  const value = await getSupabaseClient();
  if (!value) throw new Error("Supabase is not configured");
  return value;
}

const optional = (value: unknown) => value === null || value === undefined ? undefined : String(value);

function group(row: Row): CapitalGroup {
  return { id: String(row.id), name: String(row.name), archivedAt: optional(row.archived_at) };
}

function item(row: Row): CapitalItem {
  return {
    id: String(row.id), groupId: String(row.group_id), name: String(row.name),
    type: row.item_type as CapitalItem["type"], symbol: optional(row.symbol),
    quoteCurrency: row.quote_currency as CapitalItem["quoteCurrency"],
    manualPrice: optional(row.manual_price), primaryProvider: optional(row.primary_provider) as CapitalItem["primaryProvider"],
    primaryAssetId: optional(row.primary_asset_id), fallbackProvider: optional(row.fallback_provider) as CapitalItem["fallbackProvider"],
    fallbackAssetId: optional(row.fallback_asset_id), archivedAt: optional(row.archived_at),
  };
}

function event(row: Row): CapitalEvent {
  return {
    id: String(row.id), itemId: String(row.item_id), relatedItemId: optional(row.related_item_id),
    type: row.event_type as CapitalEvent["type"], status: row.status as CapitalEvent["status"],
    occurredAt: String(row.occurred_at), quantity: optional(row.quantity), unitPrice: optional(row.unit_price),
    amount: optional(row.amount), fee: optional(row.fee), tax: optional(row.tax),
    currency: row.currency as CapitalEvent["currency"], splitRatio: optional(row.split_ratio),
    source: row.source as CapitalEvent["source"], notes: optional(row.notes), deletedAt: optional(row.deleted_at),
  };
}

export async function loadCapitalData(): Promise<CapitalSnapshot> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("get_capital_snapshot");
  if (error) throw error;
  const snapshot = (data ?? {}) as Record<string, Row[]>;
  return {
    groups: (snapshot.groups ?? []).map(group),
    items: (snapshot.items ?? []).map(item),
    events: (snapshot.events ?? []).map(event),
  };
}

export async function saveCapitalData(snapshot: Partial<CapitalSnapshot>) {
  const supabase = await client();
  const { error } = await supabase.rpc("save_capital_snapshot", {
    capital_data: {
      groups: snapshot.groups?.map((value) => ({ id: value.id, name: value.name, archived_at: value.archivedAt ?? null })) ?? [],
      items: snapshot.items?.map((value) => ({ id: value.id, group_id: value.groupId, name: value.name, item_type: value.type, symbol: value.symbol ?? null, quote_currency: value.quoteCurrency, manual_price: value.manualPrice ?? null, primary_provider: value.primaryProvider ?? null, primary_asset_id: value.primaryAssetId ?? null, fallback_provider: value.fallbackProvider ?? null, fallback_asset_id: value.fallbackAssetId ?? null, archived_at: value.archivedAt ?? null })) ?? [],
      events: snapshot.events?.map((value) => ({ id: value.id, item_id: value.itemId, related_item_id: value.relatedItemId ?? null, event_type: value.type, status: value.status, occurred_at: value.occurredAt, quantity: value.quantity ?? null, unit_price: value.unitPrice ?? null, amount: value.amount ?? null, fee: value.fee ?? null, tax: value.tax ?? null, currency: value.currency, split_ratio: value.splitRatio ?? null, source: value.source, notes: value.notes ?? null, deleted_at: value.deletedAt ?? null })) ?? [],
    },
  });
  if (error) throw error;
}
