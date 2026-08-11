import { requireSupabaseClient } from "../../shared/api/supabase";
import type { CapitalEvent, CapitalGroup, CapitalItem, CapitalPortfolio } from "./capitalTypes";

type Row = Record<string, unknown>;

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
    if (["coingecko", "tradingview"].includes(String(value))) return value as CapitalItem["primaryProvider"];
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

export async function loadCapitalPortfolio(ownerId: string): Promise<CapitalPortfolio> {
  const supabase = await requireSupabaseClient();
  const { data, error } = await supabase.rpc("get_capital_portfolio", { expected_owner_id: ownerId });
  if (error) throw error;
  return deserializeCapitalPortfolio(data);
}

export function deserializeCapitalPortfolio(data: unknown): CapitalPortfolio {
  const portfolio = (data ?? {}) as Record<string, Row[]>;
  return {
    groups: (portfolio.groups ?? []).map(group),
    items: (portfolio.items ?? []).map(item),
    events: (portfolio.events ?? []).map(event),
  };
}

const serializeCapitalEvents = (events: CapitalEvent[] = []) => events.map((value) => ({ id: value.id, item_id: value.itemId, related_item_id: value.relatedItemId ?? null, event_type: value.type, status: value.status, occurred_at: value.occurredAt, quantity: value.quantity ?? null, amount: value.amount ?? null, fee: value.fee ?? null, tax: value.tax ?? null, currency: value.currency, split_ratio: value.splitRatio ?? null, source: value.source, reinvest: value.reinvest ?? false, external_provider: value.externalProvider ?? null, external_id: value.externalId ?? null }));

export function serializeCapitalRecords(records: Partial<CapitalPortfolio>) {
  return {
    groups: records.groups?.map((value) => ({ id: value.id, name: value.name })) ?? [],
    items: records.items?.map((value) => ({ id: value.id, group_id: value.groupId, name: value.name, item_type: value.type, symbol: value.symbol ?? null, quote_currency: value.quoteCurrency, manual_price: value.manualPrice ?? null, primary_provider: value.primaryProvider ?? null, primary_asset_id: value.primaryAssetId ?? null, fallback_provider: value.fallbackProvider ?? null, fallback_asset_id: value.fallbackAssetId ?? null, default_tax_rate: value.defaultTaxRate ?? null, annual_interest_rate: value.annualInterestRate ?? null, interest_cadence: value.interestCadence ?? null, interest_effective_from: value.interestEffectiveFrom ?? null, interest_compounding: value.interestCompounding ?? false, income_destination_item_id: value.incomeDestinationItemId ?? null })) ?? [],
    events: serializeCapitalEvents(records.events),
  };
}

export async function saveCapitalRecords(ownerId: string, records: Partial<CapitalPortfolio>) {
  const supabase = await requireSupabaseClient();
  const { error } = await supabase.rpc("save_capital_records", {
    expected_owner_id: ownerId,
    capital_records: serializeCapitalRecords(records),
  });
  if (error) throw error;
}

async function deleteCapitalRecord(rpc: "delete_capital_group" | "delete_capital_item", ownerId: string, id: string) {
  const supabase = await requireSupabaseClient();
  const { error } = await supabase.rpc(rpc, { expected_owner_id: ownerId, target_id: id });
  if (error) throw error;
}

export const deleteCapitalGroup = (ownerId: string, id: string) => deleteCapitalRecord("delete_capital_group", ownerId, id);
export const deleteCapitalItem = (ownerId: string, id: string) => deleteCapitalRecord("delete_capital_item", ownerId, id);
export async function deleteCapitalEvent(ownerId: string, id: string, replacements: CapitalEvent[]) {
  const supabase = await requireSupabaseClient();
  const { error } = await supabase.rpc("delete_capital_event", { expected_owner_id: ownerId, target_id: id, replacement_rows: serializeCapitalEvents(replacements) });
  if (error) throw error;
}
