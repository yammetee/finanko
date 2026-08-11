import { initializeExpenseData, resetExpenseData } from "../features/expenses/expenseStore";

let activeOwnerId: string | null = null;

function ignoreFailure(promise: Promise<unknown>) {
  void promise.catch(() => undefined);
}

export function startAuthenticatedStartup(ownerId: string) {
  if (activeOwnerId === ownerId) return;
  activeOwnerId = ownerId;
  ignoreFailure(initializeExpenseData(ownerId));
}

export function resetAuthenticatedStartup() {
  activeOwnerId = null;
  resetExpenseData();
}
