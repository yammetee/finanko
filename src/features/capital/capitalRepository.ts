import { getSupabaseClient } from "../../shared/api/supabase";
import type { CapitalEvent, CapitalGroup, CapitalItem, CapitalQuote, CapitalSnapshot, CapitalValuation } from "./capitalTypes";

type Row = Record<string, unknown>;

async function client() {
  const value = await getSupabaseClient();
  if (!value) throw new Error("Supabase is not configured");
  return value;
}

const optional = (value: unknown) => value === null || value === undefined ? undefined : String(value);
const isoTimestamp = (value: unknown) => {
  const timestamp = new Date(String(value));
  if (!Number.isFinite(timestamp.getTime())) throw new Error("Invalid capital timestamp");
  return timestamp.toISOString();
};

function group(row: Row): CapitalGroup {
  return { id: String(row.id), name: String(row.name) };
}

function item(row: Row): CapitalItem {
  const type = row.item_type as CapitalItem["type"];
  const normalizeProvider = (value: unknown): CapitalItem["primaryProvider"] => {
    if (!value) return undefined;
    if (["bybit", "coingecko", "nasdaq", "yahoo"].includes(String(value))) return value as CapitalItem["primaryProvider"];
    return undefined;
  };
  return {
    id: String(row.id), groupId: String(row.group_id), name: String(row.name),
    type, symbol: optional(row.symbol),
    quoteCurrency: row.quote_currency as CapitalItem["quoteCurrency"],
    manualPrice: optional(row.manual_price), primaryProvider: normalizeProvider(row.primary_provider),
    primaryAssetId: optional(row.primary_asset_id), fallbackProvider: normalizeProvider(row.fallback_provider),
    fallbackAssetId: optional(row.fallback_asset_id),
    annualInterestRate: optional(row.annual_interest_rate), interestCadence: optional(row.interest_cadence) as CapitalItem["interestCadence"],
    interestEffectiveFrom: optional(row.interest_effective_from), interestCompounding: Boolean(row.interest_compounding),
    incomeDestinationItemId: optional(row.income_destination_item_id), defaultTaxRate: optional(row.default_tax_rate),
  };
}

function event(row: Row): CapitalEvent {
  return {
    id: String(row.id), itemId: String(row.item_id), relatedItemId: optional(row.related_item_id),
    type: row.event_type as CapitalEvent["type"], status: row.status as CapitalEvent["status"],
    occurredAt: isoTimestamp(row.occurred_at), quantity: optional(row.quantity),
    amount: optional(row.amount), fee: optional(row.fee), tax: optional(row.tax),
    currency: row.currency as CapitalEvent["currency"], splitRatio: optional(row.split_ratio),
    source: row.source as CapitalEvent["source"], reinvest: Boolean(row.reinvest),
    externalProvider: optional(row.external_provider), externalId: optional(row.external_id),
  };
}

function quote(row: Row): CapitalQuote {
  return { itemId: String(row.item_id), price: String(row.price), currency: row.quote_currency as CapitalQuote["currency"], provider: String(row.provider), quotedAt: isoTimestamp(row.quoted_at) };
}

function valuation(row: Row): CapitalValuation {
  return { date: String(row.snapshot_date), totalUsd: String(row.total_value) };
}

export async function loadCapitalData(ownerId: string): Promise<CapitalSnapshot> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("get_capital_snapshot", { expected_owner_id: ownerId });
  if (error) throw error;
  return deserializeCapitalSnapshot(data);
}

export function deserializeCapitalSnapshot(data: unknown): CapitalSnapshot {
  const snapshot = (data ?? {}) as Record<string, Row[]>;
  return {
    groups: (snapshot.groups ?? []).map(group),
    items: (snapshot.items ?? []).map(item),
    events: (snapshot.events ?? []).map(event),
    latestQuotes: (snapshot.quotes ?? []).map(quote),
    quoteHistory: (snapshot.quoteHistory ?? []).map(quote),
    valuations: (snapshot.snapshots ?? []).map(valuation),
  };
}

export async function saveCapitalHistory(ownerId: string, quotes: CapitalQuote[], values: CapitalValuation[]) {
  const supabase = await client();
  const { error } = await supabase.rpc("rebuild_capital_history", { expected_owner_id: ownerId, quote_rows: quotes.map((value) => ({ item_id: value.itemId, price: value.price, currency: value.currency, provider: value.provider, quoted_at: value.quotedAt })), snapshot_rows: values.map((value) => ({ date: value.date, total_usd: value.totalUsd })) });
  if (error) throw error;
}

export async function saveCapitalValuation(ownerId: string, quotes: CapitalQuote[], totalUsd: string) {
  const supabase = await client();
  const { error } = await supabase.rpc("save_capital_valuation", {
    expected_owner_id: ownerId,
    quote_rows: quotes.map((value) => ({ item_id: value.itemId, price: value.price, currency: value.currency, provider: value.provider, quoted_at: value.quotedAt })),
    value_usd: totalUsd,
  });
  if (error) throw error;
}

const serializeCapitalEvents = (events: CapitalEvent[] = []) => events.map((value) => ({ id: value.id, item_id: value.itemId, related_item_id: value.relatedItemId ?? null, event_type: value.type, status: value.status, occurred_at: value.occurredAt, quantity: value.quantity ?? null, amount: value.amount ?? null, fee: value.fee ?? null, tax: value.tax ?? null, currency: value.currency, split_ratio: value.splitRatio ?? null, source: value.source, reinvest: value.reinvest ?? false, external_provider: value.externalProvider ?? null, external_id: value.externalId ?? null }));

export function serializeCapitalSnapshot(snapshot: Partial<CapitalSnapshot>) {
  return {
    groups: snapshot.groups?.map((value) => ({ id: value.id, name: value.name })) ?? [],
    items: snapshot.items?.map((value) => ({ id: value.id, group_id: value.groupId, name: value.name, item_type: value.type, symbol: value.symbol ?? null, quote_currency: value.quoteCurrency, manual_price: value.manualPrice ?? null, primary_provider: value.primaryProvider ?? null, primary_asset_id: value.primaryAssetId ?? null, fallback_provider: value.fallbackProvider ?? null, fallback_asset_id: value.fallbackAssetId ?? null, default_tax_rate: value.defaultTaxRate ?? null, annual_interest_rate: value.annualInterestRate ?? null, interest_cadence: value.interestCadence ?? null, interest_effective_from: value.interestEffectiveFrom ?? null, interest_compounding: value.interestCompounding ?? false, income_destination_item_id: value.incomeDestinationItemId ?? null })) ?? [],
    events: serializeCapitalEvents(snapshot.events),
  };
}

export async function saveCapitalData(ownerId: string, snapshot: Partial<CapitalSnapshot>) {
  const supabase = await client();
  const { error } = await supabase.rpc("save_capital_snapshot", {
    expected_owner_id: ownerId,
    capital_data: serializeCapitalSnapshot(snapshot),
  });
  if (error) throw error;
}

async function deleteCapitalRecord(rpc: "delete_capital_group" | "delete_capital_item", ownerId: string, id: string) {
  const supabase = await client();
  const { error } = await supabase.rpc(rpc, { expected_owner_id: ownerId, target_id: id });
  if (error) throw error;
}

export const deleteCapitalGroup = (ownerId: string, id: string) => deleteCapitalRecord("delete_capital_group", ownerId, id);
export const deleteCapitalItem = (ownerId: string, id: string) => deleteCapitalRecord("delete_capital_item", ownerId, id);
export async function deleteCapitalEvent(ownerId: string, id: string, replacements: CapitalEvent[]) {
  const supabase = await client();
  const { error } = await supabase.rpc("delete_capital_event", { expected_owner_id: ownerId, target_id: id, replacement_rows: serializeCapitalEvents(replacements) });
  if (error) throw error;
}
