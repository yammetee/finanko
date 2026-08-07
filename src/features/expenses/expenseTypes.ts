import type {
  Category,
  Currency,
  Expense,
  ExpenseItem,
  ExpenseSource,
} from "../../shared/types/expense";

export interface NewExpenseInput {
  amount: number;
  currency: Currency;
  categoryId: string;
  description: string;
  occurredAt: string;
  source?: ExpenseSource;
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

export interface ExpenseSnapshot {
  categories: Category[];
  expenses: Expense[];
  expenseItems: ExpenseItem[];
}

export interface ExpenseState extends ExpenseSnapshot {
  addExpense: (input: NewExpenseInput) => Promise<void>;
  updateExpense: (id: string, input: NewExpenseInput) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
}
