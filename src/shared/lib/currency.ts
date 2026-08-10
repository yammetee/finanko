import type { Currency } from "../types/expense";

type RateRow = Record<Currency, number>;

let liveRateRow: RateRow | null = null;

export function setLiveExchangeRates(row: RateRow | null) {
  liveRateRow = row;
}

function getRateRow() {
  if (!liveRateRow) throw new Error("exchange_rates_unavailable");
  return liveRateRow;
}

export function getConversionRates(from: Currency, to: Currency) {
  const row = getRateRow();
  return { from: String(row[from]), to: String(row[to]) };
}

export function convertMoney(
  amount: number,
  from: Currency,
  to: Currency,
  date?: string,
) {
  void date;
  if (from === to) return amount;
  const row = getRateRow();
  const usdAmount = amount / row[from];
  return usdAmount * row[to];
}
