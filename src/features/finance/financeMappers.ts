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
    annualInterestRate:
      row.annual_interest_rate === null || row.annual_interest_rate === undefined
        ? undefined
        : numberFromDb(row.annual_interest_rate),
    interestFrequency: row.interest_frequency ?? undefined,
    interestStartedAt: optionalString(row.interest_started_at ?? null),
    interestAllocationAccountId: optionalString(row.interest_allocation_account_id ?? null),
    loanTermMonths: row.loan_term_months ?? undefined,
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
    linkedAccountId: optionalString(row.linked_account_id ?? null),
    principalAmount:
      row.principal_amount === null || row.principal_amount === undefined
        ? undefined
        : numberFromDb(row.principal_amount),
    interestAmount:
      row.interest_amount === null || row.interest_amount === undefined
        ? undefined
        : numberFromDb(row.interest_amount),
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
    endsAt: optionalString(row.ends_at ?? null),
    isActive: row.is_active,
  };
}
