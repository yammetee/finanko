import { initializeExpenseData, resetExpenseData } from "../features/expenses/expenseStore";
import { clearPreloadedFinancialSummary, preloadFinancialSummary } from "../features/summary/financialSummaryRepository";
import { loadAuthenticatedApp } from "./authenticatedAppModule";

let activeOwnerId: string | null = null;

function ignoreFailure(promise: Promise<unknown>) {
  void promise.catch(() => undefined);
}

export function startAuthenticatedStartup(ownerId: string) {
  if (activeOwnerId === ownerId) return;
  const previousOwnerId = activeOwnerId;
  activeOwnerId = ownerId;

  const app = loadAuthenticatedApp();

  ignoreFailure(app);
  ignoreFailure(initializeExpenseData(ownerId));
  if (previousOwnerId) clearPreloadedFinancialSummary(previousOwnerId);
  ignoreFailure(preloadFinancialSummary(ownerId));
}

export function resetAuthenticatedStartup() {
  const previousOwnerId = activeOwnerId;
  activeOwnerId = null;
  resetExpenseData();
  if (previousOwnerId) clearPreloadedFinancialSummary(previousOwnerId);
}
