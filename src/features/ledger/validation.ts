import type { Currency } from "../../shared/types/finance";
import { decimalToMinor } from "./money";

export interface ItemAmountInput {
  amount: number;
}

export function getItemsTotalMinor(items: ItemAmountInput[], currency: Currency) {
  return items.reduce((sum, item) => sum + decimalToMinor(item.amount, currency), 0);
}

export function validateItemsMatchTotal(input: {
  items: ItemAmountInput[];
  total: number;
  currency: Currency;
}) {
  if (input.items.length === 0) return;

  const itemTotalMinor = getItemsTotalMinor(input.items, input.currency);
  const totalMinor = decimalToMinor(input.total, input.currency);

  if (itemTotalMinor !== totalMinor) {
    throw new Error("Transaction item total must match transaction amount");
  }
}
