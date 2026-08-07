import type { Currency } from "../types/expense";

export function formatMoney(amount: number, currency: Currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 2,
  }).format(amount);
}
