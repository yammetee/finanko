import { LogOut } from "lucide-react";
import { CURRENCIES } from "../shared/constants/expenses";
import { useI18n } from "../shared/i18n/i18nContext";
import type { Currency } from "../shared/types/expense";
import { CurrencyIcon, NativeCurrencyIcon } from "../shared/ui/CurrencyIcon";
import { useAuthStore } from "../features/auth/authStore";

export type DisplayCurrency = Currency | "native";
export type AppPage = "expenses" | "capital" | "debts";
interface Props { page: AppPage; currencyMode: DisplayCurrency; onCurrencyChange: (value: DisplayCurrency) => void; onPageChange: (page: AppPage) => void }

export function AppHeader({ page, currencyMode, onCurrencyChange, onPageChange }: Props) {
  const { locale, setLocale, t } = useI18n();
  const signOut = useAuthStore((state) => state.signOut);
  const modes: DisplayCurrency[] = ["native", ...CURRENCIES];
  const next = modes[(modes.indexOf(currencyMode) + 1) % modes.length];
  const currentLabel = currencyMode === "native" ? t("currency.native") : currencyMode;
  const nextLabel = next === "native" ? t("currency.native") : next;
  return <header className="app-header">
    <button aria-label="Finanko" className="brand" type="button" onClick={() => onPageChange("expenses")}><span aria-hidden="true">F</span><b>Finanko</b></button>
    <nav className="header-tabs" aria-label={locale === "ru" ? "Разделы" : "Sections"}>
      <button aria-current={page === "expenses" ? "page" : undefined} className={page === "expenses" ? "active" : ""} type="button" onClick={() => onPageChange("expenses")}>{t("expense.history")}</button>
      <button aria-current={page === "capital" ? "page" : undefined} className={page === "capital" ? "active" : ""} type="button" onClick={() => onPageChange("capital")}>{t("capital.title")}</button>
      <button aria-current={page === "debts" ? "page" : undefined} className={page === "debts" ? "active" : ""} type="button" onClick={() => onPageChange("debts")}>{t("debt.title")}</button>
    </nav>
    <div className="header-actions"><button className="currency-button" type="button" title={t("currency.switch", { current: currentLabel, next: nextLabel })} onClick={() => onCurrencyChange(next)}>{currencyMode === "native" ? <NativeCurrencyIcon size={15} /> : <CurrencyIcon currency={currencyMode} size={15} />}<span className="currency-label">{currentLabel}</span></button><button type="button" onClick={() => setLocale(locale === "ru" ? "en" : "ru")}>{locale.toUpperCase()}</button><button type="button" aria-label={t("actions.signOut")} onClick={() => void signOut()}><LogOut size={17} /></button></div>
  </header>;
}
