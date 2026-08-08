import { decimal, decimalString, divide, multiply } from "./decimal";

const decimalPattern = /^\d{1,20}(?:[.,]\d{1,18})?$/;
const signedDecimalPattern = /^-?\d{1,20}(?:[.,]\d{1,18})?$/;

export function normalizeCapitalDecimal(value?: string) {
  const normalized = value?.trim().replace(",", ".");
  return normalized || undefined;
}

export function isNonNegativeCapitalDecimal(value?: string) {
  const normalized = normalizeCapitalDecimal(value);
  return normalized === undefined || decimalPattern.test(normalized);
}

export function isPositiveCapitalDecimal(value?: string) {
  const normalized = normalizeCapitalDecimal(value);
  return normalized !== undefined && decimalPattern.test(normalized) && /[1-9]/.test(normalized);
}

export function isNonZeroCapitalDecimal(value?: string) {
  const normalized = normalizeCapitalDecimal(value);
  return normalized !== undefined && signedDecimalPattern.test(normalized) && decimal(normalized) !== 0n;
}

export function isCapitalPercent(value?: string) {
  const normalized = normalizeCapitalDecimal(value);
  return normalized === undefined || decimalPattern.test(normalized) && decimal(normalized) <= decimal("100");
}

export function rateToPercentInput(rate?: string) {
  return rate ? decimalString(multiply(decimal(rate), decimal("100"))) : "";
}

export function percentInputToRate(percent?: string) {
  const normalized = normalizeCapitalDecimal(percent);
  return normalized === undefined ? undefined : decimalString(divide(decimal(normalized), decimal("100")));
}
