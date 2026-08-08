import type { Currency } from "../../shared/types/expense";
import { convertMoney } from "../../shared/lib/currency";
import { buildDebtProjection } from "./debtMath";
import type { Debt, DebtEvent } from "./debtTypes";

export function buildDebtPositions(debts: Debt[], events: DebtEvent[]) {
  return debts.map((debt) => ({ debt, projection: buildDebtProjection(debt, events) }));
}

export function getOutstandingDebt(debts: Debt[], events: DebtEvent[], currency: Currency) {
  return buildDebtPositions(debts, events)
    .filter(({ projection }) => projection.status === "active")
    .reduce((sum, { debt, projection }) => sum + convertMoney(Number(projection.principal), debt.currency, currency), 0);
}
