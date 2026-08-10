import { loadTrendChart } from "../shared/ui/trendChartModule";
import { loadAuthenticatedApp } from "./authenticatedAppModule";

let activeOwnerId: string | null = null;
let expenseStoreModule: Promise<typeof import("../features/expenses/expenseStore")> | null = null;
let financialSummaryModule: Promise<typeof import("../features/summary/financialSummaryRepository")> | null = null;

function ignoreFailure(promise: Promise<unknown>) {
  void promise.catch(() => undefined);
}

export function startAuthenticatedStartup(ownerId: string) {
  if (activeOwnerId === ownerId) return;
  const previousOwnerId = activeOwnerId;
  activeOwnerId = ownerId;

  const app = loadAuthenticatedApp();
  const chart = loadTrendChart();
  expenseStoreModule ??= import("../features/expenses/expenseStore");
  financialSummaryModule ??= import("../features/summary/financialSummaryRepository");
  const exchangeRatesModule = import("../shared/lib/exchangeRates");

  ignoreFailure(app);
  ignoreFailure(chart);
  ignoreFailure(expenseStoreModule.then(({ initializeExpenseData }) => initializeExpenseData(ownerId)));
  if (previousOwnerId) {
    ignoreFailure(financialSummaryModule.then(({ clearPreloadedFinancialSummary }) => clearPreloadedFinancialSummary(previousOwnerId)));
  }
  ignoreFailure(financialSummaryModule.then(({ preloadFinancialSummary }) => preloadFinancialSummary(ownerId)));
  ignoreFailure(exchangeRatesModule.then(({ refreshLiveExchangeRates }) => refreshLiveExchangeRates()));
}

export function resetAuthenticatedStartup() {
  const previousOwnerId = activeOwnerId;
  activeOwnerId = null;
  if (expenseStoreModule) {
    ignoreFailure(expenseStoreModule.then(({ resetExpenseData }) => resetExpenseData()));
  }
  if (previousOwnerId && financialSummaryModule) {
    ignoreFailure(financialSummaryModule.then(({ clearPreloadedFinancialSummary }) => clearPreloadedFinancialSummary(previousOwnerId)));
  }
}
