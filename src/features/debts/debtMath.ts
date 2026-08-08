import { decimal, decimalString, divide, multiply, roundDecimal, type Decimal } from "../../shared/lib/decimal";
import type { Debt, DebtEarlyRepaymentPreview, DebtEvent, DebtPayment, DebtPaymentBreakdown, DebtProjection, DebtScheduleEntry } from "./debtTypes";

const ZERO = decimal("0");

function money(value: Decimal) {
  return roundDecimal(value, 2);
}

function min(left: Decimal, right: Decimal) {
  return left < right ? left : right;
}

function max(left: Decimal, right: Decimal) {
  return left > right ? left : right;
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) throw new Error("Invalid debt date");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== `${match[1]}-${match[2]}-${match[3]}`) throw new Error("Invalid debt date");
  return date;
}

function dateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysInYear(year: number) {
  return Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1) === 366 * 86_400_000 ? 366 : 365;
}

function addMonthsClamped(value: string, months: number) {
  const source = parseDate(value);
  const targetMonth = source.getUTCMonth() + months;
  const first = new Date(Date.UTC(source.getUTCFullYear(), targetMonth, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(source.getUTCDate(), lastDay));
  return dateString(first);
}

export function compareDebtEvents(left: DebtEvent, right: DebtEvent) {
  return left.occurredAt.localeCompare(right.occurredAt) || left.sequence - right.sequence || left.id.localeCompare(right.id);
}

export function calculateDailyInterest(principalText: string, annualRateText: string, from: string, through: string) {
  const principal = decimal(principalText);
  const annualRate = decimal(annualRateText);
  let cursor = parseDate(from);
  const end = parseDate(through);
  if (end < cursor) throw new Error("Debt event precedes the balance date");
  let interest = ZERO;

  while (cursor < end) {
    const nextYear = new Date(Date.UTC(cursor.getUTCFullYear() + 1, 0, 1));
    const segmentEnd = nextYear < end ? nextYear : end;
    const days = Math.round((segmentEnd.getTime() - cursor.getTime()) / 86_400_000);
    const fraction = divide(decimal(String(days)), decimal(String(daysInYear(cursor.getUTCFullYear()))));
    interest += multiply(multiply(principal, annualRate), fraction);
    cursor = segmentEnd;
  }

  return decimalString(money(interest));
}

export function calculateReducedPayment(paymentBeforeText: string, principalBeforeText: string, principalAfterText: string) {
  const principalBefore = decimal(principalBeforeText);
  if (principalBefore <= ZERO) return "0";
  return decimalString(money(multiply(decimal(paymentBeforeText), divide(decimal(principalAfterText), principalBefore))));
}

function projectSchedule(params: {
  principal: Decimal;
  annualRate: string;
  requiredPayment: Decimal;
  nextPaymentDate: string;
  balanceDate: string;
  maximumPayments?: number;
}) {
  const schedule: DebtScheduleEntry[] = [];
  let principal = params.principal;
  let anchor = params.balanceDate;
  let paymentDate = params.nextPaymentDate;
  const maximum = params.maximumPayments ?? 1_200;

  for (let index = 0; index < maximum && principal > ZERO; index += 1) {
    const interest = decimal(calculateDailyInterest(decimalString(principal), params.annualRate, anchor, paymentDate));
    const due = money(principal + interest);
    const amount = params.maximumPayments !== undefined && index === maximum - 1 ? due : min(params.requiredPayment, due);
    if (amount <= interest && amount < due) throw new Error("Required payment does not cover accrued interest");
    const principalPart = min(principal, max(ZERO, amount - interest));
    principal = money(principal - principalPart);
    schedule.push({
      paymentDate,
      amount: decimalString(amount),
      interest: decimalString(interest),
      principal: decimalString(principalPart),
      principalAfter: decimalString(principal),
    });
    anchor = paymentDate;
    paymentDate = addMonthsClamped(params.nextPaymentDate, index + 1);
  }

  return schedule;
}

export function buildDebtProjection(debt: Debt, events: DebtEvent[], asOf = new Date().toISOString().slice(0, 10)): DebtProjection {
  let principal = money(decimal(debt.principalBalance));
  const annualRate = decimal(debt.annualRate);
  let requiredPayment = money(decimal(debt.requiredPayment));
  let remainingPayments = debt.remainingPayments;
  let anchor = debt.balanceDate;
  let nextPaymentDate = debt.nextPaymentDate;
  const payments: DebtPaymentBreakdown[] = [];

  if (principal <= ZERO || annualRate <= ZERO || requiredPayment <= ZERO || remainingPayments <= 0) throw new Error("Invalid debt terms");

  for (const event of events.filter((entry) => entry.debtId === debt.id).sort(compareDebtEvents)) {
    const eventDate = event.occurredAt.slice(0, 10);
    if (eventDate < anchor) throw new Error("Debt events must follow the balance date");
    if (event.type === "reconciliation") {
      principal = money(decimal(event.principalBalance));
      if (principal < ZERO) throw new Error("Debt principal cannot be negative");
      anchor = eventDate;
      continue;
    }

    const interest = decimal(calculateDailyInterest(decimalString(principal), debt.annualRate, anchor, eventDate));
    const amount = money(decimal(event.amount));
    const payoff = money(principal + interest);
    if (amount <= ZERO || amount > payoff) throw new Error("Invalid debt payment amount");
    if (amount < interest) throw new Error("Debt payment does not cover accrued interest");

    const principalBeforePayment = principal;
    const totalPrincipalPart = min(principal, amount - interest);
    const scheduledAmount = min(requiredPayment, payoff);
    const scheduledPrincipal = min(totalPrincipalPart, max(ZERO, scheduledAmount - interest));
    const earlyPrincipal = max(ZERO, totalPrincipalPart - scheduledPrincipal);
    principal = money(principal - totalPrincipalPart);

    if (event.strategy === "full" && principal !== ZERO) throw new Error("Full payoff must close the debt");
    if (event.strategy !== "full" && principal === ZERO) throw new Error("A payoff must use the full strategy");
    if (earlyPrincipal > ZERO && event.strategy === "scheduled") throw new Error("An early payment needs a repayment strategy");
    if (earlyPrincipal === ZERO && (event.strategy === "reduce_payment" || event.strategy === "reduce_term")) throw new Error("The payment has no early principal");

    if (eventDate >= nextPaymentDate && remainingPayments > 0) {
      remainingPayments -= 1;
      nextPaymentDate = addMonthsClamped(nextPaymentDate, 1);
    }

    if (principal > ZERO && earlyPrincipal > ZERO && event.strategy === "reduce_payment") {
      const principalBeforeEarly = principal + earlyPrincipal;
      requiredPayment = decimal(calculateReducedPayment(decimalString(requiredPayment), decimalString(principalBeforeEarly), decimalString(principal)));
    }

    if (principal > ZERO && earlyPrincipal > ZERO && event.strategy === "reduce_term") {
      const reducedSchedule = projectSchedule({
        principal,
        annualRate: debt.annualRate,
        requiredPayment,
        nextPaymentDate,
        balanceDate: eventDate,
      });
      remainingPayments = reducedSchedule.length;
    }

    if (principal === ZERO) remainingPayments = 0;
    payments.push({
      eventId: event.id,
      occurredAt: event.occurredAt,
      amount: decimalString(amount),
      interest: decimalString(interest),
      scheduledPrincipal: decimalString(scheduledPrincipal),
      earlyPrincipal: decimalString(earlyPrincipal),
      principalAfter: decimalString(principal),
      requiredPaymentAfter: decimalString(principal === ZERO ? ZERO : requiredPayment),
      remainingPaymentsAfter: remainingPayments,
      strategy: event.strategy,
    });
    anchor = eventDate;
    if (principalBeforePayment === principal && amount > interest) throw new Error("Debt payment did not reduce principal");
  }

  const schedule = principal > ZERO ? projectSchedule({
    principal,
    annualRate: debt.annualRate,
    requiredPayment,
    nextPaymentDate,
    balanceDate: anchor,
    maximumPayments: remainingPayments,
  }) : [];
  const futureInterest = schedule.reduce((sum, entry) => sum + decimal(entry.interest), ZERO);
  const accruedThrough = asOf > anchor && principal > ZERO ? calculateDailyInterest(decimalString(principal), debt.annualRate, anchor, asOf) : "0";

  return {
    debtId: debt.id,
    principal: decimalString(principal),
    accruedInterest: accruedThrough,
    requiredPayment: decimalString(principal === ZERO ? ZERO : requiredPayment),
    nextPaymentDate: principal === ZERO ? undefined : nextPaymentDate,
    remainingPayments: schedule.length,
    futureInterest: decimalString(futureInterest),
    totalRemainingCost: decimalString(principal + futureInterest),
    status: principal === ZERO ? "closed" : "active",
    payments,
    schedule,
  };
}

export function calculatePayoffAmount(debt: Debt, events: DebtEvent[], payoffDate: string) {
  const projection = buildDebtProjection(debt, events, payoffDate);
  return decimalString(money(decimal(projection.principal) + decimal(projection.accruedInterest)));
}

export function previewEarlyRepayment(debt: Debt, events: DebtEvent[], payment: DebtPayment): DebtEarlyRepaymentPreview {
  if (payment.strategy !== "reduce_payment" && payment.strategy !== "reduce_term" && payment.strategy !== "full") throw new Error("Early repayment strategy required");
  const withoutDraft = events.filter((event) => event.id !== payment.id);
  const current = buildDebtProjection(debt, withoutDraft, payment.occurredAt.slice(0, 10));
  const scheduledAmount = min(decimal(current.requiredPayment), decimal(calculatePayoffAmount(debt, withoutDraft, payment.occurredAt.slice(0, 10))));
  const baseline: DebtPayment = { ...payment, id: `${payment.id}-baseline`, amount: decimalString(scheduledAmount), strategy: scheduledAmount === decimal(calculatePayoffAmount(debt, withoutDraft, payment.occurredAt.slice(0, 10))) ? "full" : "scheduled" };
  const baselineProjection = buildDebtProjection(debt, [...withoutDraft, baseline], payment.occurredAt.slice(0, 10));
  const projection = buildDebtProjection(debt, [...withoutDraft, payment], payment.occurredAt.slice(0, 10));
  const interestSaved = max(ZERO, decimal(baselineProjection.futureInterest) - decimal(projection.futureInterest));
  return {
    projection,
    interestSaved: decimalString(interestSaved),
    requiredPaymentAfter: projection.requiredPayment,
    remainingPaymentsAfter: projection.remainingPayments,
    payoffDateAfter: projection.schedule[projection.schedule.length - 1]?.paymentDate,
  };
}
