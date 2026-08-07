import dayjs, { type Dayjs } from "dayjs";
import type {
  Currency,
  ExpenseSource,
} from "../../shared/types/expense";
import { convertMoney } from "../../shared/lib/currency";
import type { NewExpenseInput } from "./expenseTypes";
import type { ReceiptReview } from "../receipts/expenseParser";

export interface ExpenseDraftItem {
  name: string;
  amount?: number;
  currency: Currency;
  categoryId: string;
}

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
      currency,
      categoryId: categoryId ?? "",
    }],
  };
}

export function calculateExpenseItemsTotal(
  items: Array<Pick<ExpenseDraftItem, "amount" | "currency">>,
  displayCurrency: Currency,
  occurredAt?: string,
) {
  return Math.round(items.reduce((sum, item) => {
    const amount = Number(item.amount);
    return sum + (Number.isFinite(amount)
      ? convertMoney(amount, item.currency, displayCurrency, occurredAt)
      : 0);
  }, 0) * 100) / 100;
}

export function expenseFormToInputs(values: ExpenseFormValues): NewExpenseInput[] {
  return (values.items ?? []).map((item) => ({
    amount: item.amount ?? 0,
    currency: item.currency,
    categoryId: item.categoryId,
    description: item.name.trim().slice(0, 2000),
    occurredAt: values.occurredAt.toISOString(),
    source: values.source,
  }));
}
