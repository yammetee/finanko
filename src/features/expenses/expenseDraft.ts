import dayjs, { type Dayjs } from "dayjs";
import type {
  Currency,
  TransactionSource,
} from "../../shared/types/finance";
import type { NewExpenseInput } from "../finance/financeTypes";
import type { ParsedExpenseItem, ReceiptReview } from "../receipts/expenseParser";

export interface ExpenseDraft {
  amount?: number;
  currency: Currency;
  categoryId?: string;
  description: string;
  occurredAt: Dayjs;
  source: TransactionSource;
  items: Array<ParsedExpenseItem & { id?: string }>;
  receiptReview?: ReceiptReview;
}

export interface ExpenseFormValues {
  amount: number;
  currency: Currency;
  categoryId: string;
  description?: string;
  occurredAt: Dayjs;
  source: TransactionSource;
  items?: Array<ParsedExpenseItem & { id?: string }>;
}

export function createEmptyExpenseDraft(
  currency: Currency,
  categoryId?: string,
): ExpenseDraft {
  return {
    currency,
    categoryId,
    description: "",
    occurredAt: dayjs(),
    source: "manual",
    items: [],
  };
}

export function expenseFormToInput(values: ExpenseFormValues): NewExpenseInput {
  return {
    amount: values.amount,
    currency: values.currency,
    categoryId: values.categoryId,
    description: values.description?.trim() ?? "",
    occurredAt: values.occurredAt.toISOString(),
    source: values.source,
    items: values.items ?? [],
  };
}
