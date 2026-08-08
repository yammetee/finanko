import { decimal, decimalString, divide, multiply } from "./decimal";

export function rateToPercentInput(rate?: string) {
  return rate ? decimalString(multiply(decimal(rate), decimal("100"))) : "";
}

export function percentInputToRate(percent?: string) {
  if (!percent?.trim()) return undefined;
  const normalized = percent.trim().replace(",", ".");
  return decimalString(divide(decimal(normalized), decimal("100")));
}
