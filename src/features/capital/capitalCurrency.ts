import { getConversionRates } from "../../shared/lib/currency";
import { decimal, decimalString, divide, multiply } from "./decimal";
import type { CapitalCurrency } from "./capitalTypes";

export function convertCapitalMoney(amount: string, from: CapitalCurrency, to: CapitalCurrency, date?: string) {
  if (from === to) return decimalString(decimal(amount));
  const rates = getConversionRates(from, to, date);
  return decimalString(multiply(divide(decimal(amount), decimal(rates.from)), decimal(rates.to)));
}

export function sumCapitalValues(values: string[]) {
  return decimalString(values.reduce((sum, value) => sum + decimal(value), 0n));
}
