import type {
  AccountType,
  Currency,
  TransactionSource,
  TransactionType,
} from "../types/finance";

export interface PortfolioRow {
  id: string;
  user_id: string;
  name: string;
  base_currency: Currency;
  deleted_at: string | null;
}

export interface AccountRow {
  id: string;
  portfolio_id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  initial_balance: number | string;
  color: string;
  annual_interest_rate?: number | string | null;
  interest_frequency?: "daily" | "monthly" | null;
  interest_started_at?: string | null;
  interest_allocation_account_id?: string | null;
  loan_term_months?: number | null;
  is_archived: boolean;
  deleted_at: string | null;
}

export interface CategoryRow {
  id: string;
  portfolio_id: string;
  name: string;
  type: "income" | "expense";
  color: string;
}

export interface TransactionRow {
  id: string;
  portfolio_id: string;
  account_id: string;
  type: TransactionType;
  amount: number | string;
  currency: Currency;
  category_id: string | null;
  description: string;
  occurred_at: string;
  source: TransactionSource;
  recurring_rule_id: string | null;
  deleted_at: string | null;
}

export interface TransactionItemRow {
  id: string;
  transaction_id: string;
  name: string;
  amount: number | string;
  category_id: string | null;
  confidence: number | string;
}

export interface RecurringRuleRow {
  id: string;
  portfolio_id: string;
  account_id: string;
  type: "income" | "expense";
  amount: number | string;
  currency: Currency;
  category_id: string | null;
  description: string;
  day_of_month: number;
  starts_at: string;
  ends_at?: string | null;
  is_active: boolean;
}
