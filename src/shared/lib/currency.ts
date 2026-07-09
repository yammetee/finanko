import dayjs from "dayjs";
import ratesData from "../data/exchangeRates.json";
import type { Currency } from "../types/finance";

type RateRow = Record<Currency, number> & { date: string };

const rates = ratesData.rates as RateRow[];
let liveRateRow: RateRow | null = null;

export function setLiveExchangeRates(row: RateRow | null) {
  liveRateRow = row;
}

function getRateRow(date?: string) {
  if (liveRateRow) return liveRateRow;
  const target = date ? dayjs(date) : dayjs();
  return (
    [...rates]
      .sort((a, b) => +new Date(b.date) - +new Date(a.date))
      .find((row) => !dayjs(row.date).isAfter(target, "day")) ?? rates[rates.length - 1]
  );
}

export function convertMoney(
  amount: number,
  from: Currency,
  to: Currency,
  date?: string,
) {
  if (from === to) return amount;
  const row = getRateRow(date);
  const usdAmount = amount / row[from];
  return usdAmount * row[to];
}
