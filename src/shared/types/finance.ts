export type Currency = "USD" | "EUR" | "THB" | "RUB";

export type AccountType =
  | "cash"
  | "bank"
  | "card"
  | "savings"
  | "investment"
  | "crypto"
  | "debt"
  | "custom";

export type TransactionType = "income" | "expense" | "adjustment";
export type TransactionSource = "manual" | "text_ai" | "receipt_ai" | "recurring";
export type Timeframe = "week" | "month" | "year" | "all";

export interface Portfolio {
  id: string;
  name: string;
  baseCurrency: Currency;
  deletedAt?: string;
}

export interface Account {
  id: string;
  portfolioId: string;
  name: string;
  type: AccountType;
  currency: Currency;
  initialBalance: number;
  color: string;
  isArchived?: boolean;
  deletedAt?: string;
}

export interface Category {
  id: string;
  portfolioId: string;
  name: string;
  type: "income" | "expense";
  color: string;
}

export interface Transaction {
  id: string;
  portfolioId: string;
  accountId: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  categoryId: string;
  description: string;
  occurredAt: string;
  source: TransactionSource;
  recurringRuleId?: string;
  deletedAt?: string;
}

export interface TransactionItem {
  id: string;
  transactionId: string;
  name: string;
  amount: number;
  categoryId: string;
  confidence: number;
}

export interface RecurringRule {
  id: string;
  portfolioId: string;
  accountId: string;
  type: "income" | "expense";
  amount: number;
  currency: Currency;
  categoryId: string;
  description: string;
  dayOfMonth: number;
  startsAt: string;
  isActive: boolean;
}
