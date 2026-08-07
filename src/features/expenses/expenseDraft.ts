import dayjs, { type Dayjs } from "dayjs";
import type {
  Currency,
  ExpenseSource,
} from "../../shared/types/expense";
import type { NewExpenseInput } from "./expenseTypes";
import type { ParsedExpenseItem, ReceiptReview } from "../receipts/expenseParser";

export type ExpenseDraftItem = Omit<ParsedExpenseItem, "amount"> & {
  id?: string;
  amount?: number;
};

export interface ExpenseDraft {
  currency: Currency;
  occurredAt: Dayjs;
  source: ExpenseSource;
  items: ExpenseDraftItem[];
  receiptReview?: ReceiptReview;
}

export interface ExpenseFormValues {
  currency: Currency;
  occurredAt: Dayjs;
  source: ExpenseSource;
  items?: ExpenseDraftItem[];
}

export function createEmptyExpenseDraft(
  currency: Currency,
  categoryId?: string,
  item: Pick<ExpenseDraftItem, "name"> & Partial<Pick<ExpenseDraftItem, "amount">> = { name: "" },
): ExpenseDraft {
  return {
    currency,
    occurredAt: dayjs(),
    source: "manual",
    items: [{
      name: item.name,
      amount: item.amount,
      categoryId: categoryId ?? "",
      confidence: 1,
    }],
  };
}

export function calculateExpenseItemsTotal(
  items: Array<Pick<ExpenseDraftItem, "amount">>,
) {
  return Math.round(items.reduce((sum, item) => {
    const amount = Number(item.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0) * 100) / 100;
}

export function expenseFormToInput(values: ExpenseFormValues): NewExpenseInput {
  const items = (values.items ?? []).map((item) => ({
    ...item,
    amount: item.amount ?? 0,
  }));
  const description = items.map((item) => item.name.trim()).filter(Boolean).join(", ").slice(0, 2000);

  return {
    amount: calculateExpenseItemsTotal(items),
    currency: values.currency,
    categoryId: items[0]?.categoryId ?? "",
    description,
    occurredAt: values.occurredAt.toISOString(),
    source: values.source,
    items,
  };
}
