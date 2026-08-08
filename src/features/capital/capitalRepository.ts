import { getSupabaseClient } from "../../shared/api/supabase";
import type { CapitalEvent, CapitalGroup, CapitalItem, CapitalQuote, CapitalSnapshot, CapitalValuation } from "./capitalTypes";

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
  const type = row.item_type as CapitalItem["type"];
  const normalizeProvider = (value: unknown): CapitalItem["primaryProvider"] => {
    if (!value) return undefined;
    if (type === "stock" || type === "fund") return "nasdaq";
    return value === "coingecko" ? "coingecko" : "bybit";
  };
  return {
    id: String(row.id), groupId: String(row.group_id), name: String(row.name),
    type, symbol: optional(row.symbol),
    quoteCurrency: row.quote_currency as CapitalItem["quoteCurrency"],
    manualPrice: optional(row.manual_price), primaryProvider: normalizeProvider(row.primary_provider),
    primaryAssetId: optional(row.primary_asset_id), fallbackProvider: normalizeProvider(row.fallback_provider),
    fallbackAssetId: optional(row.fallback_asset_id), archivedAt: optional(row.archived_at),
    annualInterestRate: optional(row.annual_interest_rate), interestCadence: optional(row.interest_cadence) as CapitalItem["interestCadence"],
    interestEffectiveFrom: optional(row.interest_effective_from), interestCompounding: Boolean(row.interest_compounding),
    incomeDestinationItemId: optional(row.income_destination_item_id), defaultTaxRate: optional(row.default_tax_rate),
  };
}

function event(row: Row): CapitalEvent {
  return {
    id: String(row.id), itemId: String(row.item_id), relatedItemId: optional(row.related_item_id),
    type: row.event_type as CapitalEvent["type"], status: row.status as CapitalEvent["status"],
    occurredAt: String(row.occurred_at), quantity: optional(row.quantity), unitPrice: optional(row.unit_price),
    amount: optional(row.amount), fee: optional(row.fee), tax: optional(row.tax),
    currency: row.currency as CapitalEvent["currency"], splitRatio: optional(row.split_ratio),
    source: row.source as CapitalEvent["source"], notes: optional(row.notes), reinvest: Boolean(row.reinvest),
    externalProvider: optional(row.external_provider), externalId: optional(row.external_id), deletedAt: optional(row.deleted_at),
  };
}

function quote(row: Row): CapitalQuote {
  return { itemId: String(row.item_id), price: String(row.price), currency: row.quote_currency as CapitalQuote["currency"], provider: String(row.provider), quotedAt: String(row.quoted_at) };
}

function valuation(row: Row): CapitalValuation {
  return { date: String(row.snapshot_date), totalUsd: String(row.total_value) };
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
    latestQuotes: (snapshot.quotes ?? []).map(quote),
    quoteHistory: (snapshot.quoteHistory ?? []).map(quote),
    valuations: (snapshot.snapshots ?? []).map(valuation),
  };
}

export async function saveCapitalHistory(quotes: CapitalQuote[], values: CapitalValuation[]) {
  const supabase = await client();
  const { error } = await supabase.rpc("rebuild_capital_history", { quote_rows: quotes.map((value) => ({ item_id: value.itemId, price: value.price, currency: value.currency, provider: value.provider, quoted_at: value.quotedAt })), snapshot_rows: values.map((value) => ({ date: value.date, total_usd: value.totalUsd })) });
  if (error) throw error;
}

export async function saveCapitalValuation(quotes: CapitalQuote[], totalUsd: string) {
  const supabase = await client();
  const { error } = await supabase.rpc("save_capital_valuation", {
    quote_rows: quotes.map((value) => ({ item_id: value.itemId, price: value.price, currency: value.currency, provider: value.provider, quoted_at: value.quotedAt })),
    value_usd: totalUsd,
  });
  if (error) throw error;
}

export async function saveCapitalData(snapshot: Partial<CapitalSnapshot>) {
  const supabase = await client();
  const { error } = await supabase.rpc("save_capital_snapshot", {
    capital_data: {
      groups: snapshot.groups?.map((value) => ({ id: value.id, name: value.name, archived_at: value.archivedAt ?? null })) ?? [],
      items: snapshot.items?.map((value) => ({ id: value.id, group_id: value.groupId, name: value.name, item_type: value.type, symbol: value.symbol ?? null, quote_currency: value.quoteCurrency, manual_price: value.manualPrice ?? null, primary_provider: value.primaryProvider ?? null, primary_asset_id: value.primaryAssetId ?? null, fallback_provider: value.fallbackProvider ?? null, fallback_asset_id: value.fallbackAssetId ?? null, default_tax_rate: value.defaultTaxRate ?? null, annual_interest_rate: value.annualInterestRate ?? null, interest_cadence: value.interestCadence ?? null, interest_effective_from: value.interestEffectiveFrom ?? null, interest_compounding: value.interestCompounding ?? false, income_destination_item_id: value.incomeDestinationItemId ?? null, archived_at: value.archivedAt ?? null })) ?? [],
      events: snapshot.events?.map((value) => ({ id: value.id, item_id: value.itemId, related_item_id: value.relatedItemId ?? null, event_type: value.type, status: value.status, occurred_at: value.occurredAt, quantity: value.quantity ?? null, unit_price: value.unitPrice ?? null, amount: value.amount ?? null, fee: value.fee ?? null, tax: value.tax ?? null, currency: value.currency, split_ratio: value.splitRatio ?? null, source: value.source, notes: value.notes ?? null, reinvest: value.reinvest ?? false, external_provider: value.externalProvider ?? null, external_id: value.externalId ?? null, deleted_at: value.deletedAt ?? null })) ?? [],
    },
  });
  if (error) throw error;
}
