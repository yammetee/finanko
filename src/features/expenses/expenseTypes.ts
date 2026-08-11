import type {
  Category,
  Currency,
  Expense,
  ExpenseSource,
} from "../../shared/types/expense";
import type { LoadState } from "../../shared/types/loadState";

export interface ExpenseRange {
  start?: string;
  end?: string;
}

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
  trackingStartedAt?: string;
}

export interface ExpenseState extends ExpenseSnapshot {
  ownerId: string | null;
  loadState: LoadState;
  rangeLoading: boolean;
  retry: () => Promise<void>;
  loadRange: (range: ExpenseRange) => Promise<void>;
  addExpenses: (inputs: NewExpenseInput[]) => Promise<void>;
  updateExpense: (id: string, input: NewExpenseInput) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
}
