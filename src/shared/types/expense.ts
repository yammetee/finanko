export type Currency = "USD" | "GEL" | "RUB" | "THB";

export type ExpenseSource = "manual" | "text_ai" | "receipt_ai";

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface Expense {
  id: string;
  amount: number;
  currency: Currency;
  categoryId: string;
  description: string;
  occurredAt: string;
  source: ExpenseSource;
  deletedAt?: string;
}
