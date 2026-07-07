import type {
  Account,
  Category,
  Portfolio,
  RecurringRule,
  Transaction,
  TransactionItem,
} from "../../shared/types/finance";
import type {
  AccountRow,
  CategoryRow,
  PortfolioRow,
  RecurringRuleRow,
  TransactionRow,
  TransactionItemRow,
} from "../../shared/api/databaseTypes";

function numberFromDb(value: number | string) {
  return typeof value === "number" ? value : Number(value);
}

function optionalString(value: string | null) {
  return value ?? undefined;
}

export function mapPortfolioRow(row: PortfolioRow): Portfolio {
  return {
    id: row.id,
    name: row.name,
    baseCurrency: row.base_currency,
    deletedAt: optionalString(row.deleted_at),
  };
}

export function mapAccountRow(row: AccountRow): Account {
  return {
    id: row.id,
    portfolioId: row.portfolio_id,
    name: row.name,
    type: row.type,
    currency: row.currency,
    initialBalance: numberFromDb(row.initial_balance),
    color: row.color,
    isArchived: row.is_archived,
    deletedAt: optionalString(row.deleted_at),
  };
}

export function mapCategoryRow(row: CategoryRow): Category {
  return {
    id: row.id,
    portfolioId: row.portfolio_id,
    name: row.name,
    type: row.type,
    color: row.color,
  };
}

export function mapTransactionRow(row: TransactionRow): Transaction {
  return {
    id: row.id,
    portfolioId: row.portfolio_id,
    accountId: row.account_id,
    type: row.type,
    amount: numberFromDb(row.amount),
    currency: row.currency,
    categoryId: row.category_id ?? "",
    description: row.description,
    occurredAt: row.occurred_at,
    source: row.source,
    recurringRuleId: optionalString(row.recurring_rule_id),
    deletedAt: optionalString(row.deleted_at),
  };
}

export function mapTransactionItemRow(row: TransactionItemRow): TransactionItem {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    name: row.name,
    amount: numberFromDb(row.amount),
    categoryId: row.category_id ?? "",
    confidence: numberFromDb(row.confidence),
  };
}

export function mapRecurringRuleRow(row: RecurringRuleRow): RecurringRule {
  return {
    id: row.id,
    portfolioId: row.portfolio_id,
    accountId: row.account_id,
    type: row.type,
    amount: numberFromDb(row.amount),
    currency: row.currency,
    categoryId: row.category_id ?? "",
    description: row.description,
    dayOfMonth: row.day_of_month,
    startsAt: row.starts_at,
    isActive: row.is_active,
  };
}
