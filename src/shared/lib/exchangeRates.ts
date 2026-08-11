import type { Currency } from "../types/expense";
import { fetchWithTimeout } from "../api/fetchWithTimeout";
import { setLiveExchangeRates } from "./currency";

const exchangeRatesUrl = "https://open.er-api.com/v6/latest/USD";

interface ExchangeRatesResponse {
  result?: string;
  rates?: Partial<Record<Currency, number>>;
}

function isFiniteRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function refreshLiveExchangeRates() {
  try {
    const response = await fetchWithTimeout(exchangeRatesUrl, { cache: "no-store" }, 8_000);
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
      USD: usd,
      GEL: gel,
      RUB: rub,
      THB: thb,
    };
    setLiveExchangeRates(rates);
    return true;
  } catch {
    return false;
  }
}
