import { getSupabaseClient } from "../../shared/api/supabase";
import type { Account, Category, Portfolio, RecurringRule, Transaction, TransactionItem } from "../../shared/types/finance";
import type { FinanceSnapshot } from "./financeTypes";

type Row = Record<string, unknown>;

async function client() {
  const value = await getSupabaseClient();
  if (!value) throw new Error("Supabase is not configured");
  return value;
}

function required<T>(value: T | null, message: string): T {
  if (value === null) throw new Error(message);
  return value;
}

function portfolioFromRow(row: Row): Portfolio {
  return { id: String(row.id), name: String(row.name), baseCurrency: row.base_currency as Portfolio["baseCurrency"], deletedAt: row.deleted_at as string | undefined };
}

function accountFromRow(row: Row): Account {
  const isArchived = Boolean(row.is_archived);
  return {
    id: String(row.id), portfolioId: String(row.portfolio_id), name: String(row.name), type: row.type as Account["type"],
    currency: row.currency as Account["currency"], initialBalance: Number(row.initial_balance), color: String(row.color),
    annualInterestRate: row.annual_interest_rate == null ? undefined : Number(row.annual_interest_rate),
    interestFrequency: (row.interest_frequency as Account["interestFrequency"]) ?? undefined,
    interestStartedAt: (row.interest_started_at as string) ?? undefined,
    interestAllocationAccountId: (row.interest_allocation_account_id as string) ?? undefined,
    loanTermMonths: row.loan_term_months == null ? undefined : Number(row.loan_term_months),
    isArchived, deletedAt: isArchived ? undefined : (row.deleted_at as string) ?? undefined,
  };
}

function categoryFromRow(row: Row): Category {
  return { id: String(row.id), portfolioId: String(row.portfolio_id), name: String(row.name), type: row.type as Category["type"], color: String(row.color) };
}

function transactionFromRow(row: Row): Transaction {
  return {
    id: String(row.id), portfolioId: String(row.portfolio_id), accountId: String(row.account_id), type: row.type as Transaction["type"],
    amount: Number(row.amount), currency: row.currency as Transaction["currency"], categoryId: String(row.category_id ?? ""),
    linkedAccountId: (row.linked_account_id as string) ?? undefined,
    principalAmount: row.principal_amount == null ? undefined : Number(row.principal_amount),
    interestAmount: row.interest_amount == null ? undefined : Number(row.interest_amount),
    description: String(row.description), occurredAt: String(row.occurred_at), source: row.source as Transaction["source"],
    recurringRuleId: (row.recurring_rule_id as string) ?? undefined, deletedAt: (row.deleted_at as string) ?? undefined,
  };
}

function itemFromRow(row: Row): TransactionItem {
  return { id: String(row.id), transactionId: String(row.transaction_id), name: String(row.name), amount: Number(row.amount),
    quantity: row.quantity == null ? undefined : Number(row.quantity), unitPrice: row.unit_price == null ? undefined : Number(row.unit_price),
    categoryId: String(row.category_id), confidence: Number(row.confidence) };
}

function recurringFromRow(row: Row): RecurringRule {
  return { id: String(row.id), portfolioId: String(row.portfolio_id), accountId: String(row.account_id), type: row.type as RecurringRule["type"],
    amount: Number(row.amount), currency: row.currency as RecurringRule["currency"], categoryId: String(row.category_id), description: String(row.description),
    dayOfMonth: Number(row.day_of_month), startsAt: String(row.starts_at), endsAt: (row.ends_at as string) ?? undefined, isActive: Boolean(row.is_active) };
}

export async function loadFinanceData(): Promise<FinanceSnapshot> {
  const supabase = await client();
  const [portfolios, accounts, categories, transactions, items, recurring] = await Promise.all([
    supabase.from("portfolios").select("*").order("created_at"),
    supabase.from("accounts").select("*").order("created_at"),
    supabase.from("categories").select("*").order("created_at"),
    supabase.from("transactions").select("*").order("occurred_at"),
    supabase.from("transaction_items").select("*").order("created_at"),
    supabase.from("recurring_rules").select("*").order("created_at"),
  ]);
  const error = [portfolios, accounts, categories, transactions, items, recurring].find((result) => result.error)?.error;
  if (error) throw error;
  const mappedPortfolios = (portfolios.data ?? []).map((row) => portfolioFromRow(row as Row));
  return {
    activePortfolioId: mappedPortfolios.find((item) => !item.deletedAt)?.id ?? "", timeframe: "month", transactionFilter: "all", currencyDisplay: "native",
    portfolios: mappedPortfolios, accounts: (accounts.data ?? []).map((row) => accountFromRow(row as Row)),
    categories: (categories.data ?? []).map((row) => categoryFromRow(row as Row)), transactions: (transactions.data ?? []).map((row) => transactionFromRow(row as Row)),
    transactionItems: (items.data ?? []).map((row) => itemFromRow(row as Row)), recurringRules: (recurring.data ?? []).map((row) => recurringFromRow(row as Row)),
  };
}

export async function insertPortfolio(portfolio: Portfolio, ownerId: string) {
  const supabase = await client();
  const { error } = await supabase.from("portfolios").insert({ id: portfolio.id, owner_id: ownerId, name: portfolio.name, base_currency: portfolio.baseCurrency });
  if (error) throw error;
}

export async function updatePortfolio(id: string, values: Partial<{ name: string; base_currency: string; deleted_at: string }>) {
  const supabase = await client(); const { error } = await supabase.from("portfolios").update(values).eq("id", id); if (error) throw error;
}

function accountRow(account: Account) {
  return { id: account.id, portfolio_id: account.portfolioId, name: account.name, type: account.type, currency: account.currency, initial_balance: account.initialBalance,
    color: account.color, annual_interest_rate: account.annualInterestRate ?? null, interest_frequency: account.interestFrequency ?? null,
    interest_started_at: account.interestStartedAt ?? null, interest_allocation_account_id: account.interestAllocationAccountId ?? null,
    loan_term_months: account.loanTermMonths ?? null, is_archived: account.isArchived ?? false, deleted_at: account.deletedAt ?? null };
}
export async function saveAccount(account: Account) { const supabase = await client(); const { error } = await supabase.from("accounts").upsert(accountRow(account)); if (error) throw error; }
export async function saveCategories(categories: Category[]) { if (!categories.length) return; const supabase = await client(); const { error } = await supabase.from("categories").upsert(categories.map((c) => ({ id:c.id, portfolio_id:c.portfolioId, name:c.name, type:c.type, color:c.color }))); if (error) throw error; }

function recurringRow(rule: RecurringRule) { return { id:rule.id, portfolio_id:rule.portfolioId, account_id:rule.accountId, type:rule.type, amount:rule.amount, currency:rule.currency,
  category_id:rule.categoryId, description:rule.description, day_of_month:rule.dayOfMonth, starts_at:rule.startsAt, ends_at:rule.endsAt ?? null, is_active:rule.isActive }; }
export async function saveRecurringRules(rules: RecurringRule[]) { if (!rules.length) return; const supabase = await client(); const { error } = await supabase.from("recurring_rules").upsert(rules.map(recurringRow)); if (error) throw error; }

function transactionRow(tx: Transaction) { return { id:tx.id, portfolio_id:tx.portfolioId, account_id:tx.accountId, type:tx.type, amount:tx.amount, currency:tx.currency,
  category_id:tx.categoryId || null, linked_account_id:tx.linkedAccountId ?? null, principal_amount:tx.principalAmount ?? null, interest_amount:tx.interestAmount ?? null,
  description:tx.description, occurred_at:tx.occurredAt, source:tx.source, recurring_rule_id:tx.recurringRuleId ?? null, deleted_at:tx.deletedAt ?? null }; }
function itemRow(item: TransactionItem) { return { id:item.id, transaction_id:item.transactionId, name:item.name, amount:item.amount, quantity:item.quantity ?? null,
  unit_price:item.unitPrice ?? null, category_id:item.categoryId, confidence:item.confidence }; }

export async function saveTransaction(tx: Transaction, items: TransactionItem[], rule?: RecurringRule) {
  const supabase = await client();
  const { error } = await supabase.rpc("save_finance_transaction", {
    tx: transactionRow(tx), items: items.map(itemRow), rule: rule ? recurringRow(rule) : null,
  });
  if (error) throw error;
}

export async function saveGenerated(categories: Category[], transactions: Transaction[]) {
  await saveCategories(categories);
  if (!transactions.length) return;
  const supabase = await client(); const { error } = await supabase.from("transactions").upsert(transactions.map(transactionRow)); if (error) throw error;
}

export async function resetFinanceData(portfolioIds: string[]) {
  const supabase = await client();
  const { error } = await supabase.from("portfolios").delete().in("id", required(portfolioIds.length ? portfolioIds : null, "No portfolios to reset"));
  if (error) throw error;
}
