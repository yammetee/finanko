import type { Currency } from "../../shared/types/expense";

export type DebtLoanType = "consumer" | "mortgage";
export type DebtStatus = "active" | "closed";
export type DebtPaymentStrategy = "scheduled" | "reduce_term" | "reduce_payment" | "full";

export interface DebtGroup {
  id: string;
  name: string;
}

export interface Debt {
  id: string;
  groupId: string;
  name: string;
  lender?: string;
  loanType: DebtLoanType;
  currency: Currency;
  principalBalance: string;
  annualRate: string;
  requiredPayment: string;
  balanceDate: string;
  nextPaymentDate: string;
  remainingPayments: number;
  status: DebtStatus;
}

interface DebtEventBase {
  id: string;
  debtId: string;
  occurredAt: string;
  sequence: number;
}

export interface DebtPayment extends DebtEventBase {
  type: "payment";
  amount: string;
  strategy: DebtPaymentStrategy;
}

export interface DebtReconciliation extends DebtEventBase {
  type: "reconciliation";
  principalBalance: string;
}

export type DebtEvent = DebtPayment | DebtReconciliation;

export interface DebtPaymentBreakdown {
  eventId: string;
  occurredAt: string;
  amount: string;
  interest: string;
  scheduledPrincipal: string;
  earlyPrincipal: string;
  principalAfter: string;
  requiredPaymentAfter: string;
  remainingPaymentsAfter: number;
  strategy: DebtPaymentStrategy;
}

export interface DebtScheduleEntry {
  paymentDate: string;
  amount: string;
  interest: string;
  principal: string;
  principalAfter: string;
}

export interface DebtProjection {
  debtId: string;
  principal: string;
  accruedInterest: string;
  requiredPayment: string;
  nextPaymentDate?: string;
  remainingPayments: number;
  futureInterest: string;
  totalRemainingCost: string;
  status: DebtStatus;
  payments: DebtPaymentBreakdown[];
  schedule: DebtScheduleEntry[];
}

export interface DebtEarlyRepaymentPreview {
  projection: DebtProjection;
  interestSaved: string;
  requiredPaymentAfter: string;
  remainingPaymentsAfter: number;
  payoffDateAfter?: string;
}

export interface DebtSnapshot {
  groups: DebtGroup[];
  debts: Debt[];
  events: DebtEvent[];
}
