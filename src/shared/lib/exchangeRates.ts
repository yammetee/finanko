import type { Currency } from "../types/expense";
import { setLiveExchangeRates } from "./currency";

const exchangeRatesUrl = "https://open.er-api.com/v6/latest/USD";
const exchangeRatesCacheKey = "evenkvit:exchange-rates";

interface ExchangeRatesResponse {
  date?: string;
  result?: string;
  time_last_update_utc?: string;
  rates?: Partial<Record<Currency, number>>;
}

function isFiniteRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function cachedRates() {
  try {
    const value = JSON.parse(localStorage.getItem(exchangeRatesCacheKey) ?? "null") as ExchangeRatesResponse | null;
    const usd = value?.rates?.USD;
    const gel = value?.rates?.GEL;
    const rub = value?.rates?.RUB;
    const thb = value?.rates?.THB;
    if (!value?.date || !isFiniteRate(usd) || !isFiniteRate(gel) || !isFiniteRate(rub) || !isFiniteRate(thb)) return null;
    return { date: value.date, USD: usd, GEL: gel, RUB: rub, THB: thb };
  } catch {
    return null;
  }
}

function cacheRates(rates: { date: string; USD: number; GEL: number; RUB: number; THB: number }) {
  try {
    localStorage.setItem(exchangeRatesCacheKey, JSON.stringify({ date: rates.date.slice(0, 10), rates }));
  } catch {
    // Live rates remain usable for the current session when storage is unavailable.
  }
}

let exchangeRatesRequest: Promise<boolean> | null = null;

async function requestLiveExchangeRates() {
  const cached = cachedRates();
  if (cached) {
    setLiveExchangeRates(cached);
    if (cached.date === new Date().toISOString().slice(0, 10)) return true;
  }
  try {
    const response = await fetch(exchangeRatesUrl);
    if (!response.ok) return false;
    const payload = (await response.json()) as ExchangeRatesResponse;
    const usd = payload.rates?.USD;
    const gel = payload.rates?.GEL;
    const rub = payload.rates?.RUB;
    const thb = payload.rates?.THB;

    if (
      payload.result !== "success" ||
      !isFiniteRate(usd) ||
      !isFiniteRate(gel) ||
      !isFiniteRate(rub) ||
      !isFiniteRate(thb)
    ) {
      return false;
    }
    const rates = {
      date: payload.date ?? payload.time_last_update_utc ?? new Date().toISOString(),
      USD: usd,
      GEL: gel,
      RUB: rub,
      THB: thb,
    };
    setLiveExchangeRates(rates);
    cacheRates(rates);
    return true;
  } catch {
    return false;
  }
}

export function refreshLiveExchangeRates() {
  exchangeRatesRequest ??= requestLiveExchangeRates();
  return exchangeRatesRequest;
}
