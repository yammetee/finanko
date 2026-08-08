import { LogOut } from "lucide-react";
import { CURRENCIES } from "../shared/constants/expenses";
import { useI18n } from "../shared/i18n/i18nContext";
import type { Currency } from "../shared/types/expense";
import { CurrencyIcon, NativeCurrencyIcon } from "../shared/ui/CurrencyIcon";
import { useAuthStore } from "../features/auth/authStore";

export type DisplayCurrency = Currency | "native";
interface Props { page: "expenses" | "capital"; currencyMode: DisplayCurrency; onCurrencyChange: (value: DisplayCurrency) => void; onHome: () => void }

export function AppHeader({ page, currencyMode, onCurrencyChange, onHome }: Props) {
  const { locale, setLocale, t } = useI18n();
  const signOut = useAuthStore((state) => state.signOut);
  const modes: DisplayCurrency[] = ["native", ...CURRENCIES];
  const next = modes[(modes.indexOf(currencyMode) + 1) % modes.length];
  const currentLabel = currencyMode === "native" ? t("currency.native") : currencyMode;
  const nextLabel = next === "native" ? t("currency.native") : next;
  return <header className="app-header"><button className="brand" type="button" onClick={onHome}><span>F</span>Finanko</button><div className="header-actions">{page === "expenses" ? <button className="currency-button" type="button" title={t("currency.switch", { current: currentLabel, next: nextLabel })} onClick={() => onCurrencyChange(next)}>{currencyMode === "native" ? <NativeCurrencyIcon size={15} /> : <CurrencyIcon currency={currencyMode} size={15} />}{currentLabel}</button> : <span className="header-section-label">{locale === "ru" ? "Капитал" : "Capital"}</span>}<button type="button" onClick={() => setLocale(locale === "ru" ? "en" : "ru")}>{locale.toUpperCase()}</button><button type="button" aria-label={t("actions.signOut")} onClick={() => void signOut()}><LogOut size={17} /></button></div></header>;
}
