import type {
  Account,
  Category,
  Currency,
  Portfolio,
  Transaction,
  TransactionItem,
  TransactionSource,
} from "../../shared/types/finance";

export interface NewExpenseInput {
  amount: number;
  currency: Currency;
  categoryId: string;
  description: string;
  occurredAt: string;
  source?: TransactionSource;
  items?: Array<{
    id?: string;
    name: string;
    amount: number;
    quantity?: number;
    unitPrice?: number;
    categoryId: string;
    confidence: number;
  }>;
}

export interface FinanceSnapshot {
  activePortfolioId: string;
  portfolios: Portfolio[];
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  transactionItems: TransactionItem[];
}

export interface FinanceState extends FinanceSnapshot {
  addCategory: (input: Pick<Category, "name" | "type" | "color">) => Promise<void>;
  addTransaction: (input: NewExpenseInput) => Promise<void>;
  updateTransaction: (id: string, input: NewExpenseInput) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
}
