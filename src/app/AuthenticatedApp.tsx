import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
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

const CapitalPage = lazy(() => import("../features/capital/CapitalPage").then((module) => ({ default: module.CapitalPage })));
const DebtPage = lazy(() => import("../features/debts/DebtPage").then((module) => ({ default: module.DebtPage })));

function scheduleIdleTask(task: () => void) {
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  let idleHandle: number | undefined;
  const delayHandle = globalThis.setTimeout(() => {
    if (typeof idleWindow.requestIdleCallback === "function") {
      idleHandle = idleWindow.requestIdleCallback(task, { timeout: 2_000 });
      return;
    }
    task();
  }, 3_000);
  return () => {
    globalThis.clearTimeout(delayHandle);
    if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle);
  };
}

export function AuthenticatedApp() {
  const [page, setPage] = useState<AppPage>("expenses");
  const [currencyMode, setCurrencyMode] = useState<DisplayCurrency>("native");
  const [ratesVersion, setRatesVersion] = useState(0);
  const ratesRequest = useRef<Promise<void> | null>(null);
  const userId = useAuthStore((state) => state.session?.user.id);
  const capital = useCapitalStore();
  const debt = useDebtStore();
  const initializeDebt = debt.initialize;
  const resetDebt = debt.reset;
  const initializeCapital = capital.initialize;
  const resetCapital = capital.reset;
  const refreshCapitalQuotes = capital.refreshQuotes;
  const capitalLoadState = capital.loadState;
  const refreshRates = useCallback(() => {
    if (ratesRequest.current) return;
    ratesRequest.current = refreshLiveExchangeRates()
      .then((updated) => { if (updated) setRatesVersion((value) => value + 1); })
      .finally(() => { ratesRequest.current = null; });
  }, []);
  useEffect(() => { if (currencyMode !== "native") refreshRates(); }, [currencyMode, refreshRates]);
  useEffect(() => {
    resetCapital();
    if (!userId) return resetCapital;
    const cancel = scheduleIdleTask(() => {
      const current = useCapitalStore.getState();
      if (current.ownerId !== userId || current.loadState === "idle" || current.loadState === "error") void current.initialize(userId);
    });
    return () => { cancel(); resetCapital(); };
  }, [initializeCapital, resetCapital, userId]);
  useEffect(() => {
    resetDebt();
    if (!userId) return resetDebt;
    const cancel = scheduleIdleTask(() => {
      const current = useDebtStore.getState();
      if (current.ownerId !== userId || current.loadState === "idle" || current.loadState === "error") void current.initialize(userId);
    });
    return () => { cancel(); resetDebt(); };
  }, [initializeDebt, resetDebt, userId]);
  const marketItemKey = capital.items.filter((item) => item.symbol && (item.type === "stock" || item.type === "fund" || item.type === "crypto")).map((item) => item.id).sort().join(":");
  useEffect(() => { if (capital.ownerId === userId && capitalLoadState === "ready" && marketItemKey) void refreshCapitalQuotes(); }, [capital.ownerId, capitalLoadState, marketItemKey, refreshCapitalQuotes, userId]);
  const changePage = (nextPage: AppPage) => {
    setPage(nextPage);
    if (nextPage !== "expenses") refreshRates();
    if (nextPage === "capital" && userId && (capital.ownerId !== userId || capitalLoadState === "idle" || capitalLoadState === "error")) void initializeCapital(userId);
    if (nextPage === "debts" && userId && (debt.ownerId !== userId || debt.loadState === "idle" || debt.loadState === "error")) void initializeDebt(userId);
  };
  const capitalReady = Boolean(userId && capital.ownerId === userId && capitalLoadState === "ready");
  const debtReady = Boolean(userId && debt.ownerId === userId && debt.loadState === "ready");
  const capitalTotalUsd = capitalReady ? getCapitalTotalUsd(capital.items, capital.events, capital.quotes) : undefined;
  const debtTotalUsd = debtReady ? getOutstandingDebt(debt.debts, debt.events, "USD") : undefined;
  return (
    <FeedbackProvider>
      <div className="app-shell"><AppHeader page={page} onPageChange={changePage} /><main className="main-content">{page === "expenses" ? <ExpensesPage currencyMode={currencyMode} onCurrencyChange={setCurrencyMode} ratesVersion={ratesVersion} capitalTotalUsd={capitalTotalUsd} debtTotalUsd={debtTotalUsd} /> : page === "capital" ? <Suspense fallback={null}>{capitalReady ? <CapitalPage currencyMode={currencyMode} onCurrencyChange={setCurrencyMode} ratesVersion={ratesVersion} debtTotalUsd={debtTotalUsd} /> : null}</Suspense> : <Suspense fallback={null}>{debtReady ? <DebtPage currencyMode={currencyMode} onCurrencyChange={setCurrencyMode} ratesVersion={ratesVersion} /> : null}</Suspense>}</main></div>
    </FeedbackProvider>
  );
}
