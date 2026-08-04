import { getSupabaseClient } from "../../shared/api/supabase";
import type {
  Account,
  Category,
  Portfolio,
  Transaction,
  TransactionItem,
} from "../../shared/types/finance";
import type { FinanceSnapshot } from "./financeTypes";

type Row = Record<string, unknown>;

async function client() {
  const value = await getSupabaseClient();
  if (!value) throw new Error("Supabase is not configured");
  return value;
}

function portfolioFromRow(row: Row): Portfolio {
  return {
    id: String(row.id),
    name: String(row.name),
    baseCurrency: row.base_currency as Portfolio["baseCurrency"],
    deletedAt: (row.deleted_at as string) ?? undefined,
  };
}

function accountFromRow(row: Row): Account {
  return {
    id: String(row.id),
    portfolioId: String(row.portfolio_id),
    name: String(row.name),
    type: row.type as Account["type"],
    currency: row.currency as Account["currency"],
    initialBalance: Number(row.initial_balance),
    color: String(row.color),
    isArchived: Boolean(row.is_archived),
    deletedAt: (row.deleted_at as string) ?? undefined,
  };
}

function categoryFromRow(row: Row): Category {
  return {
    id: String(row.id),
    portfolioId: String(row.portfolio_id),
    name: String(row.name),
    type: row.type as Category["type"],
    color: String(row.color),
  };
}

function transactionFromRow(row: Row): Transaction {
  return {
    id: String(row.id),
    portfolioId: String(row.portfolio_id),
    accountId: String(row.account_id),
    type: row.type as Transaction["type"],
    amount: Number(row.amount),
    currency: row.currency as Transaction["currency"],
    categoryId: String(row.category_id ?? ""),
    linkedAccountId: (row.linked_account_id as string) ?? undefined,
    principalAmount: row.principal_amount == null ? undefined : Number(row.principal_amount),
    interestAmount: row.interest_amount == null ? undefined : Number(row.interest_amount),
    description: String(row.description),
    occurredAt: String(row.occurred_at),
    source: row.source as Transaction["source"],
    recurringRuleId: (row.recurring_rule_id as string) ?? undefined,
    deletedAt: (row.deleted_at as string) ?? undefined,
  };
}

function itemFromRow(row: Row): TransactionItem {
  return {
    id: String(row.id),
    transactionId: String(row.transaction_id),
    name: String(row.name),
    amount: Number(row.amount),
    quantity: row.quantity == null ? undefined : Number(row.quantity),
    unitPrice: row.unit_price == null ? undefined : Number(row.unit_price),
    categoryId: String(row.category_id),
    confidence: Number(row.confidence),
  };
}

export async function loadFinanceData(): Promise<FinanceSnapshot> {
  const supabase = await client();
  const [portfolios, accounts, categories, transactions, items] = await Promise.all([
    supabase.from("portfolios").select("*").is("deleted_at", null).order("created_at"),
    supabase.from("accounts").select("*").is("deleted_at", null).order("created_at"),
    supabase.from("categories").select("*").eq("type", "expense").order("created_at"),
    supabase
      .from("transactions")
      .select("*")
      .eq("type", "expense")
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false }),
    supabase.from("transaction_items").select("*").order("created_at"),
  ]);
  const error = [portfolios, accounts, categories, transactions, items]
    .find((result) => result.error)?.error;
  if (error) throw error;

  const mappedPortfolios = (portfolios.data ?? []).map((row) => portfolioFromRow(row as Row));
  return {
    activePortfolioId: mappedPortfolios.find((portfolio) => !portfolio.deletedAt)?.id ?? "",
    portfolios: mappedPortfolios,
    accounts: (accounts.data ?? []).map((row) => accountFromRow(row as Row)),
    categories: (categories.data ?? []).map((row) => categoryFromRow(row as Row)),
    transactions: (transactions.data ?? []).map((row) => transactionFromRow(row as Row)),
    transactionItems: (items.data ?? []).map((row) => itemFromRow(row as Row)),
  };
}

export async function insertPortfolio(portfolio: Portfolio, ownerId: string) {
  const supabase = await client();
  const { error } = await supabase.from("portfolios").insert({
    id: portfolio.id,
    owner_id: ownerId,
    name: portfolio.name,
    base_currency: portfolio.baseCurrency,
  });
  if (error) throw error;
}

function accountRow(account: Account) {
  return {
    id: account.id,
    portfolio_id: account.portfolioId,
    name: account.name,
    type: account.type,
    currency: account.currency,
    initial_balance: account.initialBalance,
    color: account.color,
    is_archived: account.isArchived ?? false,
    deleted_at: account.deletedAt ?? null,
  };
}

export async function saveAccount(account: Account) {
  const supabase = await client();
  const { error } = await supabase.from("accounts").upsert(accountRow(account));
  if (error) throw error;
}

export async function saveCategories(categories: Category[]) {
  if (categories.length === 0) return;
  const supabase = await client();
  const { error } = await supabase.from("categories").upsert(
    categories.map((category) => ({
      id: category.id,
      portfolio_id: category.portfolioId,
      name: category.name,
      type: category.type,
      color: category.color,
    })),
  );
  if (error) throw error;
}

function transactionRow(transaction: Transaction) {
  return {
    id: transaction.id,
    portfolio_id: transaction.portfolioId,
    account_id: transaction.accountId,
    type: transaction.type,
    amount: transaction.amount,
    currency: transaction.currency,
    category_id: transaction.categoryId || null,
    linked_account_id: transaction.linkedAccountId ?? null,
    principal_amount: transaction.principalAmount ?? null,
    interest_amount: transaction.interestAmount ?? null,
    description: transaction.description,
    occurred_at: transaction.occurredAt,
    source: transaction.source,
    recurring_rule_id: transaction.recurringRuleId ?? null,
    deleted_at: transaction.deletedAt ?? null,
  };
}

function itemRow(item: TransactionItem) {
  return {
    id: item.id,
    transaction_id: item.transactionId,
    name: item.name,
    amount: item.amount,
    quantity: item.quantity ?? null,
    unit_price: item.unitPrice ?? null,
    category_id: item.categoryId,
    confidence: item.confidence,
  };
}

export async function saveTransaction(transaction: Transaction, items: TransactionItem[]) {
  const supabase = await client();
  const { error } = await supabase.rpc("save_finance_transaction", {
    tx: transactionRow(transaction),
    items: items.map(itemRow),
    rule: null,
  });
  if (error) throw error;
}
