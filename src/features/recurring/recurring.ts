import dayjs, { type Dayjs } from "dayjs";
import type { RecurringRule, Transaction } from "../../shared/types/finance";

interface BuildRecurringTransactionInput {
  rule: RecurringRule;
  date: Dayjs;
  id: string;
}

export function getRecurringMonthKey(date: string | Dayjs) {
  if (typeof date === "string") return date.slice(0, 7);
  return dayjs(date).format("YYYY-MM");
}

function parseCalendarDate(value: string) {
  return dayjs(value.slice(0, 10));
}

export function hasGeneratedRecurringTransaction(
  rule: RecurringRule,
  transactions: Transaction[],
  date: Dayjs,
) {
  const monthKey = getRecurringMonthKey(date);
  return transactions.some(
    (transaction) =>
      transaction.recurringRuleId === rule.id &&
      getRecurringMonthKey(transaction.occurredAt) === monthKey,
  );
}

export function isRecurringRuleDue(rule: RecurringRule, date: Dayjs) {
  const monthStart = date.startOf("month");
  const startsAt = parseCalendarDate(rule.startsAt).startOf("month");
  const endsAt = rule.endsAt ? parseCalendarDate(rule.endsAt).endOf("month") : null;

  if (monthStart.isBefore(startsAt)) return false;
  if (endsAt && monthStart.isAfter(endsAt)) return false;
  return true;
}

export function buildRecurringTransaction({
  rule,
  date,
  id,
}: BuildRecurringTransactionInput): Transaction {
  return {
    id,
    portfolioId: rule.portfolioId,
    accountId: rule.accountId,
    type: rule.type,
    amount: rule.amount,
    currency: rule.currency,
    categoryId: rule.categoryId,
    description: rule.description,
    occurredAt: date.date(Math.min(rule.dayOfMonth, date.daysInMonth())).toISOString(),
    source: "recurring",
    recurringRuleId: rule.id,
  };
}

export function getDueRecurringTransactions({
  rules,
  transactions,
  portfolioId,
  date,
  createId,
}: {
  rules: RecurringRule[];
  transactions: Transaction[];
  portfolioId: string;
  date: Dayjs;
  createId: () => string;
}) {
  const activeRules = rules
    .filter((rule) => rule.isActive && rule.portfolioId === portfolioId)
    .filter((rule) => !dayjs(rule.startsAt).isAfter(date, "month"));

  return activeRules.flatMap((rule) => {
    const startsAt = parseCalendarDate(rule.startsAt).startOf("month");
    const requestedEnd = date.endOf("month");
    const ruleEnd = rule.endsAt ? parseCalendarDate(rule.endsAt).endOf("month") : requestedEnd;
    const endsAt = ruleEnd.isBefore(requestedEnd) ? ruleEnd : requestedEnd;
    const monthCount = Math.max(0, endsAt.startOf("month").diff(startsAt, "month") + 1);

    return Array.from({ length: monthCount }, (_, index) => startsAt.add(index, "month"))
      .filter((month) => isRecurringRuleDue(rule, month))
      .filter((month) => !hasGeneratedRecurringTransaction(rule, transactions, month))
      .map((month) => buildRecurringTransaction({ rule, date: month, id: createId() }));
  });
}
