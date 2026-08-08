import { lazy, Suspense, useEffect, useState } from "react";
import { AppThemeProvider } from "./providers/AppThemeProvider";
import { ExpensesPage } from "../features/expenses/ExpensesPage";
import { useCapitalStore } from "../features/capital/capitalStore";
import { getCapitalTotalUsd } from "../features/capital/capitalView";
import { AppHeader, type DisplayCurrency } from "./AppHeader";

const CapitalPage = lazy(() => import("../features/capital/CapitalPage").then((module) => ({ default: module.CapitalPage })));

export function AuthenticatedApp() {
  const [page, setPage] = useState<"expenses" | "capital">("expenses");
  const [currencyMode, setCurrencyMode] = useState<DisplayCurrency>("native");
  const capital = useCapitalStore();
  const initializeCapital = capital.initialize;
  const refreshCapitalQuotes = capital.refreshQuotes;
  const capitalLoadState = capital.loadState;
  useEffect(() => { if (capitalLoadState === "idle") void initializeCapital(); }, [capitalLoadState, initializeCapital]);
  const marketItemKey = capital.items.filter((item) => item.symbol && (item.type === "stock" || item.type === "fund" || item.type === "crypto")).map((item) => item.id).sort().join(":");
  useEffect(() => { if (capitalLoadState === "ready" && marketItemKey) void refreshCapitalQuotes(); }, [capitalLoadState, marketItemKey, refreshCapitalQuotes]);
  const total = Number(getCapitalTotalUsd(capital.items, capital.events, capital.quotes));
  return (
    <AppThemeProvider>
      <div className="app-shell"><AppHeader page={page} currencyMode={currencyMode} onCurrencyChange={setCurrencyMode} onHome={() => setPage("expenses")} /><main className="main-content">{page === "expenses" ? <ExpensesPage currencyMode={currencyMode} capitalTotalUsd={total} capitalState={capital.loadState} onOpenCapital={() => setPage("capital")} /> : <Suspense fallback={<div aria-live="polite" className="capital-notice" role="status">Loading…</div>}><CapitalPage onBack={() => setPage("expenses")} /></Suspense>}</main></div>
    </AppThemeProvider>
  );
}
