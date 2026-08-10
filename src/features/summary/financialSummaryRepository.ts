import { requireSupabaseClient } from "../../shared/api/supabase";
import type { Currency } from "../../shared/types/expense";

export interface FinancialSummary {
  capitalTotalUsd?: string;
  debtTotals: Partial<Record<Currency, string>>;
}

const inFlightSummaries = new Map<string, Promise<FinancialSummary>>();
const preloadedSummaries = new Map<string, Promise<FinancialSummary>>();

async function fetchFinancialSummary(ownerId: string): Promise<FinancialSummary> {
  const supabase = await requireSupabaseClient();
  const { data, error } = await supabase.rpc("get_financial_summary", { expected_owner_id: ownerId });
  if (error) throw error;
  const value = (data ?? {}) as { capital_total_usd?: unknown; debt_totals?: unknown };
  const debtTotals = value.debt_totals && typeof value.debt_totals === "object"
    ? value.debt_totals as Partial<Record<Currency, string>>
    : {};
  return {
    capitalTotalUsd: value.capital_total_usd === null || value.capital_total_usd === undefined
      ? undefined
      : String(value.capital_total_usd),
    debtTotals,
  };
}

function requestFinancialSummary(ownerId: string) {
  const existing = inFlightSummaries.get(ownerId);
  if (existing) return existing;

  const request = fetchFinancialSummary(ownerId).finally(() => {
    if (inFlightSummaries.get(ownerId) === request) inFlightSummaries.delete(ownerId);
  });
  inFlightSummaries.set(ownerId, request);
  return request;
}

export function preloadFinancialSummary(ownerId: string) {
  const existing = inFlightSummaries.get(ownerId);
  if (existing) return existing;

  const request = requestFinancialSummary(ownerId);
  preloadedSummaries.set(ownerId, request);
  return request;
}

export function clearPreloadedFinancialSummary(ownerId: string) {
  preloadedSummaries.delete(ownerId);
}

export function loadFinancialSummary(ownerId: string): Promise<FinancialSummary> {
  const preloaded = preloadedSummaries.get(ownerId);
  if (preloaded) {
    preloadedSummaries.delete(ownerId);
    return preloaded;
  }
  return requestFinancialSummary(ownerId);
}
