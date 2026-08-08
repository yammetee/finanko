import { CURRENCIES } from "../constants/expenses";
import { useI18n } from "../i18n/i18nContext";
import type { Currency } from "../types/expense";
import { CurrencyIcon, NativeCurrencyIcon } from "./CurrencyIcon";

export type DisplayCurrency = Currency | "native";

interface CurrencySwitcherProps {
  value: DisplayCurrency;
  onChange: (value: DisplayCurrency) => void;
}

export function CurrencySwitcher({ value, onChange }: CurrencySwitcherProps) {
  const { t } = useI18n();
  const modes: DisplayCurrency[] = ["native", ...CURRENCIES];
  const next = modes[(modes.indexOf(value) + 1) % modes.length];
  const currentLabel = value === "native" ? t("currency.native") : value;
  const nextLabel = next === "native" ? t("currency.native") : next;

  return <button className="summary-currency" type="button" title={t("currency.switch", { current: currentLabel, next: nextLabel })} onClick={() => onChange(next)}>{value === "native" ? <NativeCurrencyIcon size={15}/> : <CurrencyIcon currency={value} size={15}/>}<span>{currentLabel}</span></button>;
}
