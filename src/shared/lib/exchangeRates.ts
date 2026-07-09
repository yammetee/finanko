import type { Currency } from "../types/finance";
import { setLiveExchangeRates } from "./currency";

interface ExchangeRatesResponse {
  date: string;
  rates: Record<Currency, number>;
}

export async function refreshLiveExchangeRates() {
  try {
    const response = await fetch("/api/exchange-rates");
    if (!response.ok) return false;
    const payload = (await response.json()) as ExchangeRatesResponse;
    if (
      !payload.rates ||
      !Number.isFinite(payload.rates.USD) ||
      !Number.isFinite(payload.rates.GEL) ||
      !Number.isFinite(payload.rates.RUB) ||
      !Number.isFinite(payload.rates.THB)
    ) {
      return false;
    }
    setLiveExchangeRates({
      date: payload.date,
      USD: payload.rates.USD,
      GEL: payload.rates.GEL,
      RUB: payload.rates.RUB,
      THB: payload.rates.THB,
    });
    return true;
  } catch {
    return false;
  }
}
