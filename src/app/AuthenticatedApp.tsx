import { lazy, Suspense, useEffect, useState } from "react";
import { AppThemeProvider } from "./providers/AppThemeProvider";
import { ExpensesPage } from "../features/expenses/ExpensesPage";
import { useCapitalStore } from "../features/capital/capitalStore";
import { getCapitalTotalUsd } from "../features/capital/capitalView";
import { useAuthStore } from "../features/auth/authStore";
import { AppHeader, type DisplayCurrency } from "./AppHeader";
import { refreshLiveExchangeRates } from "../shared/lib/exchangeRates";

const CapitalPage = lazy(() => import("../features/capital/CapitalPage").then((module) => ({ default: module.CapitalPage })));

export function AuthenticatedApp() {
  const [page, setPage] = useState<"expenses" | "capital">("expenses");
  const [currencyMode, setCurrencyMode] = useState<DisplayCurrency>("native");
  const [ratesVersion, setRatesVersion] = useState(0);
  const userId = useAuthStore((state) => state.session?.user.id);
  const capital = useCapitalStore();
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
  const marketItemKey = capital.items.filter((item) => item.symbol && (item.type === "stock" || item.type === "fund" || item.type === "crypto")).map((item) => item.id).sort().join(":");
  useEffect(() => { if (capital.ownerId === userId && capitalLoadState === "ready" && marketItemKey) void refreshCapitalQuotes(); }, [capital.ownerId, capitalLoadState, marketItemKey, refreshCapitalQuotes, userId]);
  const changePage = (nextPage: "expenses" | "capital") => {
    setPage(nextPage);
    if (nextPage === "capital" && userId && (capital.ownerId !== userId || capitalLoadState === "idle" || capitalLoadState === "error")) void initializeCapital(userId);
  };
  const capitalReady = Boolean(userId && capital.ownerId === userId && capitalLoadState === "ready");
  const capitalTotalUsd = capitalReady ? getCapitalTotalUsd(capital.items, capital.events, capital.quotes) : undefined;
  return (
    <AppThemeProvider>
      <div className="app-shell"><AppHeader page={page} currencyMode={currencyMode} onCurrencyChange={setCurrencyMode} onPageChange={changePage} /><main className="main-content">{page === "expenses" ? <ExpensesPage currencyMode={currencyMode} ratesVersion={ratesVersion} capitalTotalUsd={capitalTotalUsd} /> : <Suspense fallback={null}>{capitalReady ? <CapitalPage ratesVersion={ratesVersion} /> : null}</Suspense>}</main></div>
    </AppThemeProvider>
  );
}
