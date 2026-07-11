import type { Currency } from "../types/finance";
import { setLiveExchangeRates } from "./currency";

const exchangeRatesUrl = "https://open.er-api.com/v6/latest/USD";

interface ExchangeRatesResponse {
  date?: string;
  result?: string;
  time_last_update_utc?: string;
  rates?: Partial<Record<Currency, number>>;
}

function isFiniteRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function refreshLiveExchangeRates() {
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
    setLiveExchangeRates({
      date: payload.date ?? payload.time_last_update_utc ?? new Date().toISOString(),
      USD: usd,
      GEL: gel,
      RUB: rub,
      THB: thb,
    });
    return true;
  } catch {
    return false;
  }
}
