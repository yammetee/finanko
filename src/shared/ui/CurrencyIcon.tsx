import { Coins } from "lucide-react";
import type { Currency } from "../types/finance";

const currencySymbols: Record<Currency, string> = {
  USD: "$",
  GEL: "₾",
  RUB: "₽",
  THB: "฿",
};

function getCurrencySymbol(currency: Currency) {
  return currencySymbols[currency];
}

export function CurrencyIcon({ currency, size = 16 }: { currency: Currency; size?: number }) {
  return <span className="currency-icon" style={{ fontSize: size }} aria-hidden>{getCurrencySymbol(currency)}</span>;
}

export function NativeCurrencyIcon({ size = 16 }: { size?: number }) {
  return <Coins aria-hidden size={size} strokeWidth={1.8} />;
}
