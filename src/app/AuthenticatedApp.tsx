import { lazy, Suspense, useEffect, useState } from "react";
import { AppThemeProvider } from "./providers/AppThemeProvider";
import { ExpensesPage } from "../features/expenses/ExpensesPage";
import { useCapitalStore } from "../features/capital/capitalStore";
import { getCapitalTotalUsd } from "../features/capital/capitalView";
import { useAuthStore } from "../features/auth/authStore";
import { AppHeader, type DisplayCurrency } from "./AppHeader";
import { refreshLiveExchangeRates } from "../shared/lib/exchangeRates";
import { useDebtStore } from "../features/debts/debtStore";
import type { AppPage } from "./AppHeader";

const CapitalPage = lazy(() => import("../features/capital/CapitalPage").then((module) => ({ default: module.CapitalPage })));
const DebtPage = lazy(() => import("../features/debts/DebtPage").then((module) => ({ default: module.DebtPage })));

export function AuthenticatedApp() {
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
    void refreshLiveExchangeRates().then((updated) => { if (active && updated) setRatesVersion((value) => value + 1); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    resetCapital();
    if (userId) void initializeCapital(userId);
    return resetCapital;
  }, [initializeCapital, resetCapital, userId]);
  useEffect(() => {
    resetDebt();
    if (userId) void initializeDebt(userId);
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
  const capitalTotalUsd = capitalReady ? getCapitalTotalUsd(capital.items, capital.events, capital.quotes) : undefined;
  return (
    <AppThemeProvider>
      <div className="app-shell"><AppHeader page={page} currencyMode={currencyMode} onCurrencyChange={setCurrencyMode} onPageChange={changePage} /><main className="main-content">{page === "expenses" ? <ExpensesPage currencyMode={currencyMode} ratesVersion={ratesVersion} capitalTotalUsd={capitalTotalUsd} /> : page === "capital" ? <Suspense fallback={null}>{capitalReady ? <CapitalPage ratesVersion={ratesVersion} /> : null}</Suspense> : <Suspense fallback={null}>{debt.ownerId === userId && debt.loadState === "ready" ? <DebtPage currencyMode={currencyMode} ratesVersion={ratesVersion} /> : null}</Suspense>}</main></div>
    </AppThemeProvider>
  );
}
