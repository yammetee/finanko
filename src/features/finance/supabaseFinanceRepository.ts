import { getSupabaseClient } from "../../shared/api/supabase";
import type {
  AccountRow,
  CategoryRow,
  PortfolioRow,
  RecurringRuleRow,
  TransactionItemRow,
  TransactionRow,
} from "../../shared/api/databaseTypes";
import type { FinanceRepository } from "./financeRepository";
import {
  mapAccountRow,
  mapCategoryRow,
  mapPortfolioRow,
  mapRecurringRuleRow,
  mapTransactionItemRow,
  mapTransactionRow,
} from "./financeMappers";
import type { FinanceSnapshot } from "./financeTypes";

async function selectTable<Row>(table: string) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.from(table).select("*");
  if (error) throw error;
  return (data ?? []) as Row[];
}

export async function getSupabaseFinanceSnapshot(): Promise<FinanceSnapshot> {
  const [
    portfolioRows,
    accountRows,
    categoryRows,
    transactionRows,
    transactionItemRows,
    recurringRuleRows,
  ] = await Promise.all([
    selectTable<PortfolioRow>("portfolios"),
    selectTable<AccountRow>("accounts"),
    selectTable<CategoryRow>("categories"),
    selectTable<TransactionRow>("transactions"),
    selectTable<TransactionItemRow>("transaction_items"),
    selectTable<RecurringRuleRow>("recurring_rules"),
  ]);

  const portfolios = portfolioRows.map(mapPortfolioRow);
  const activePortfolioId = portfolios.find((portfolio) => !portfolio.deletedAt)?.id ?? "";

  return {
    activePortfolioId,
    timeframe: "month",
    transactionFilter: "all",
    currencyDisplay: "native",
    portfolios,
    accounts: accountRows.map(mapAccountRow),
    categories: categoryRows.map(mapCategoryRow),
    transactions: transactionRows.map(mapTransactionRow),
    transactionItems: transactionItemRows.map(mapTransactionItemRow),
    recurringRules: recurringRuleRows.map(mapRecurringRuleRow),
  };
}

function notImplemented(operation: string): never {
  throw new Error(`${operation} is not wired to Supabase yet`);
}

export const supabaseFinanceRepository: FinanceRepository = {
  getSnapshot: getSupabaseFinanceSnapshot,
  createPortfolio: async () => notImplemented("createPortfolio"),
  deletePortfolio: async () => notImplemented("deletePortfolio"),
  createAccount: async () => notImplemented("createAccount"),
  archiveAccount: async () => notImplemented("archiveAccount"),
  createTransaction: async () => notImplemented("createTransaction"),
  deleteTransaction: async () => notImplemented("deleteTransaction"),
  generateDueRecurring: async () => notImplemented("generateDueRecurring"),
};
