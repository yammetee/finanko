import dayjs, { type Dayjs } from "dayjs";
import type {
  Currency,
  ExpenseSource,
} from "../../shared/types/expense";
import type { NewExpenseInput } from "./expenseTypes";
import type { ParsedExpenseItem, ReceiptReview } from "../receipts/expenseParser";

export interface ExpenseDraft {
  amount?: number;
  currency: Currency;
  categoryId?: string;
  description: string;
  occurredAt: Dayjs;
  source: ExpenseSource;
  items: Array<ParsedExpenseItem & { id?: string }>;
  receiptReview?: ReceiptReview;
}

export interface ExpenseFormValues {
  amount?: number;
  currency: Currency;
  categoryId?: string;
  description?: string;
  occurredAt: Dayjs;
  source: ExpenseSource;
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

export function calculateExpenseItemsTotal(
  items: Array<Pick<ParsedExpenseItem, "amount">>,
) {
  return Math.round(items.reduce(
    (sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0),
    0,
  ) * 100) / 100;
}

export function expenseFormToInput(values: ExpenseFormValues): NewExpenseInput {
  const items = values.items ?? [];
  const description = items.length > 0
    ? items.map((item) => item.name.trim()).filter(Boolean).join(", ").slice(0, 2000)
    : values.description?.trim() ?? "";

  return {
    amount: items.length > 0
      ? calculateExpenseItemsTotal(items)
      : values.amount ?? 0,
    currency: values.currency,
    categoryId: items[0]?.categoryId ?? values.categoryId ?? "",
    description,
    occurredAt: values.occurredAt.toISOString(),
    source: values.source,
    items,
  };
}
