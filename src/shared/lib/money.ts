import type { Currency } from "../types/expense";

const FRACTION_DIGITS: Record<Currency, number> = {
  USD: 2,
  GEL: 2,
  RUB: 2,
  THB: 2,
};

export function decimalToMinor(amount: number, currency: Currency) {
  if (!Number.isFinite(amount)) throw new Error("Money amount must be finite");
  const factor = 10 ** FRACTION_DIGITS[currency];
  const amountMinor = Math.round(amount * factor);
  if (Math.abs(amount * factor - amountMinor) > Number.EPSILON * 100) {
    throw new Error(`${currency} amount has too many fractional digits`);
  }
  return amountMinor;
}

export function isValidMoneyDecimal(amount: number, currency: Currency) {
  try {
    decimalToMinor(amount, currency);
    return true;
  } catch {
    return false;
  }
}
