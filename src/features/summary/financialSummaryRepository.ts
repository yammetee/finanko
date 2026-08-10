import { requireSupabaseClient } from "../../shared/api/supabase";
import type { Currency } from "../../shared/types/expense";

export interface FinancialSummary {
  capitalTotalUsd?: string;
  debtTotals: Partial<Record<Currency, string>>;
}

export async function loadFinancialSummary(ownerId: string): Promise<FinancialSummary> {
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
