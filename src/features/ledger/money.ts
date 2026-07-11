import type { Currency } from "../../shared/types/finance";

export interface Money {
  amountMinor: number;
  currency: Currency;
}

const FRACTION_DIGITS: Record<Currency, number> = {
  USD: 2,
  GEL: 2,
  RUB: 2,
  THB: 2,
};

export function assertFiniteMoneyAmount(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error("Money amount must be finite");
  }
}

export function getCurrencyFractionDigits(currency: Currency) {
  return FRACTION_DIGITS[currency];
}

export function decimalToMinor(amount: number, currency: Currency) {
  assertFiniteMoneyAmount(amount);
  const factor = 10 ** getCurrencyFractionDigits(currency);
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

export function minorToDecimal(amountMinor: number, currency: Currency) {
  assertFiniteMoneyAmount(amountMinor);
  const factor = 10 ** getCurrencyFractionDigits(currency);
  return amountMinor / factor;
}

export function moneyFromDecimal(amount: number, currency: Currency): Money {
  return {
    amountMinor: decimalToMinor(amount, currency),
    currency,
  };
}
