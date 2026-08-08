import { useEffect, useState } from "react";
import { AppThemeProvider } from "./providers/AppThemeProvider";
import { ExpensesPage } from "../features/expenses/ExpensesPage";
import { CapitalPage } from "../features/capital/CapitalPage";
import { useCapitalStore } from "../features/capital/capitalStore";
import { getCapitalTotalUsd } from "../features/capital/capitalView";
import { AppHeader, type DisplayCurrency } from "./AppHeader";

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
  const total = getCapitalTotalUsd(capital.items, capital.events, capital.quotes);
  return (
    <AppThemeProvider>
      <div className="app-shell"><AppHeader page={page} currencyMode={currencyMode} onCurrencyChange={setCurrencyMode} onHome={() => setPage("expenses")} /><main className="main-content">{page === "expenses" ? <ExpensesPage currencyMode={currencyMode} capitalTotalUsd={total} capitalState={capital.loadState} onOpenCapital={() => setPage("capital")} /> : <CapitalPage onBack={() => setPage("expenses")} />}</main></div>
    </AppThemeProvider>
  );
}
