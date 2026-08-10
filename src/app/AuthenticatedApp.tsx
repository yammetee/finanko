import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { FeedbackProvider } from "../shared/ui/FeedbackProvider";
import { ExpensesPage } from "../features/expenses/ExpensesPage";
import { useAuthStore } from "../features/auth/authStore";
import { AppHeader } from "./AppHeader";
import type { DisplayCurrency } from "../shared/ui/CurrencySwitcher";
import { refreshLiveExchangeRates } from "../shared/lib/exchangeRates";
import type { AppPage } from "./AppHeader";
import { useFinancialSummary } from "../features/summary/useFinancialSummary";
import { convertMoney } from "../shared/lib/currency";
import type { Currency } from "../shared/types/expense";
import { FeaturePageState } from "../shared/ui/FeaturePageState";

const CapitalRoute = lazy(() => import("../features/capital/CapitalRoute").then((module) => ({ default: module.CapitalRoute })));
const DebtRoute = lazy(() => import("../features/debts/DebtRoute").then((module) => ({ default: module.DebtRoute })));

export function AuthenticatedApp() {
  const [page, setPage] = useState<AppPage>("expenses");
  const [currencyMode, setCurrencyMode] = useState<DisplayCurrency>("native");
  const [ratesVersion, setRatesVersion] = useState(0);
  const userId = useAuthStore((state) => state.session?.user.id);
  const { summary, loaded: summaryLoaded, refresh: refreshSummary, updateCapitalTotal } = useFinancialSummary(userId);
  useEffect(() => {
    let active = true;
    void refreshLiveExchangeRates().then((updated) => { if (active && updated) setRatesVersion((value) => value + 1); });
    return () => { active = false; };
  }, []);
  const calculatedDebtTotalUsd = useMemo(() => {
    void ratesVersion;
    return Object.entries(summary.debtTotals).reduce((total, [currency, value]) => (
      total + convertMoney(Number(value), currency as Currency, "USD")
    ), 0);
  }, [ratesVersion, summary.debtTotals]);
  const debtTotalUsd = summaryLoaded ? calculatedDebtTotalUsd : undefined;
  const routeFallback = <FeaturePageState />;
  return (
    <FeedbackProvider>
      <div className="app-shell"><AppHeader page={page} onPageChange={setPage} /><main className="main-content">{page === "expenses" ? <ExpensesPage currencyMode={currencyMode} onCurrencyChange={setCurrencyMode} ratesVersion={ratesVersion} capitalTotalUsd={summary.capitalTotalUsd} debtTotalUsd={debtTotalUsd} /> : page === "capital" ? <Suspense fallback={routeFallback}>{userId ? <CapitalRoute userId={userId} currencyMode={currencyMode} onCurrencyChange={setCurrencyMode} ratesVersion={ratesVersion} debtTotalUsd={debtTotalUsd} onCapitalTotalChanged={updateCapitalTotal} /> : null}</Suspense> : <Suspense fallback={routeFallback}>{userId ? <DebtRoute userId={userId} currencyMode={currencyMode} onCurrencyChange={setCurrencyMode} ratesVersion={ratesVersion} onSummaryChanged={refreshSummary} /> : null}</Suspense>}</main></div>
    </FeedbackProvider>
  );
}
