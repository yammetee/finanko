import { lazy, Suspense, useEffect, useState } from "react";
import { FeedbackProvider } from "../shared/ui/FeedbackProvider";
import { ExpensesPage } from "../features/expenses/ExpensesPage";
import { useCapitalStore } from "../features/capital/capitalStore";
import { getCapitalTotalUsd } from "../features/capital/capitalView";
import { useAuthStore } from "../features/auth/authStore";
import { AppHeader } from "./AppHeader";
import type { DisplayCurrency } from "../shared/ui/CurrencySwitcher";
import { refreshLiveExchangeRates } from "../shared/lib/exchangeRates";
import { useDebtStore } from "../features/debts/debtStore";
import { getOutstandingDebt } from "../features/debts/debtView";
import type { AppPage } from "./AppHeader";
import { useI18n } from "../shared/i18n/i18nContext";

const CapitalPage = lazy(() => import("../features/capital/CapitalPage").then((module) => ({ default: module.CapitalPage })));
const DebtPage = lazy(() => import("../features/debts/DebtPage").then((module) => ({ default: module.DebtPage })));

export function AuthenticatedApp() {
  const { t } = useI18n();
  const [page, setPage] = useState<AppPage>("expenses");
  const [currencyMode, setCurrencyMode] = useState<DisplayCurrency>("native");
  const [ratesVersion, setRatesVersion] = useState(0);
  const userId = useAuthStore((state) => state.session?.user.id);
  const capital = useCapitalStore();
  const debt = useDebtStore();
  const initializeDebt = debt.initialize;
  const resetDebt = debt.reset;
  const initializeCapital = capital.initialize;
  const resetCapital = capital.reset;
  const refreshCapitalQuotes = capital.refreshQuotes;
  const capitalLoadState = capital.loadState;
  useEffect(() => {
    let active = true;
    void refreshLiveExchangeRates().then((updated) => {
      if (active && updated) setRatesVersion((value) => value + 1);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    resetCapital();
    if (!userId) return resetCapital;
    void initializeCapital(userId);
    return resetCapital;
  }, [initializeCapital, resetCapital, userId]);
  useEffect(() => {
    resetDebt();
    if (!userId) return resetDebt;
    void initializeDebt(userId);
    return resetDebt;
  }, [initializeDebt, resetDebt, userId]);
  const marketItemKey = capital.items.filter((item) => item.symbol && (item.type === "stock" || item.type === "fund" || item.type === "crypto")).map((item) => item.id).sort().join(":");
  useEffect(() => { if (capital.ownerId === userId && capitalLoadState === "ready" && marketItemKey) void refreshCapitalQuotes(); }, [capital.ownerId, capitalLoadState, marketItemKey, refreshCapitalQuotes, userId]);
  const changePage = (nextPage: AppPage) => {
    setPage(nextPage);
    if (nextPage === "capital" && userId && (capital.ownerId !== userId || capitalLoadState === "idle" || capitalLoadState === "error")) void initializeCapital(userId);
    if (nextPage === "debts" && userId && (debt.ownerId !== userId || debt.loadState === "idle" || debt.loadState === "error")) void initializeDebt(userId);
  };
  const capitalReady = Boolean(userId && capital.ownerId === userId && capitalLoadState === "ready");
  const debtReady = Boolean(userId && debt.ownerId === userId && debt.loadState === "ready");
  const capitalTotalUsd = capitalReady ? getCapitalTotalUsd(capital.items, capital.events, capital.quotes) : undefined;
  const debtTotalUsd = debtReady ? getOutstandingDebt(debt.debts, debt.events, "USD") : undefined;
  const loading = <div className="parsing-state"><div className="auth-loader" /></div>;
  const capitalContent = capital.loadState === "error"
    ? <div className="parsing-state"><span>{t("feedback.loadFailed")}</span><button type="button" onClick={() => { if (userId) void initializeCapital(userId); }}>{t("actions.retry")}</button></div>
    : capitalReady ? <CapitalPage currencyMode={currencyMode} onCurrencyChange={setCurrencyMode} ratesVersion={ratesVersion} debtTotalUsd={debtTotalUsd} /> : loading;
  const debtContent = debt.loadState === "error"
    ? <div className="parsing-state"><span>{t("feedback.loadFailed")}</span><button type="button" onClick={() => { if (userId) void initializeDebt(userId); }}>{t("actions.retry")}</button></div>
    : debtReady ? <DebtPage currencyMode={currencyMode} onCurrencyChange={setCurrencyMode} ratesVersion={ratesVersion} /> : loading;
  return (
    <FeedbackProvider>
      <div className="app-shell"><AppHeader page={page} onPageChange={changePage} /><main className="main-content">{page === "expenses" ? <ExpensesPage currencyMode={currencyMode} onCurrencyChange={setCurrencyMode} ratesVersion={ratesVersion} capitalTotalUsd={capitalTotalUsd} debtTotalUsd={debtTotalUsd} /> : page === "capital" ? <Suspense fallback={loading}>{capitalContent}</Suspense> : <Suspense fallback={loading}>{debtContent}</Suspense>}</main></div>
    </FeedbackProvider>
  );
}
