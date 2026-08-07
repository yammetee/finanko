import type {
  Category,
  Currency,
  Expense,
  ExpenseSource,
} from "../../shared/types/expense";

export interface NewExpenseInput {
  amount: number;
  currency: Currency;
  categoryId: string;
  description: string;
  occurredAt: string;
  source?: ExpenseSource;
}

export interface ExpenseSnapshot {
  categories: Category[];
  expenses: Expense[];
}

export interface ExpenseState extends ExpenseSnapshot {
  addExpenses: (inputs: NewExpenseInput[]) => Promise<void>;
  updateExpense: (id: string, input: NewExpenseInput) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
}
