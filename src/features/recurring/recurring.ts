import dayjs, { type Dayjs } from "dayjs";
import type { RecurringRule, Transaction } from "../../shared/types/finance";

interface BuildRecurringTransactionInput {
  rule: RecurringRule;
  date: Dayjs;
  id: string;
}

export function getRecurringMonthKey(date: string | Dayjs) {
  return dayjs(date).format("YYYY-MM");
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
  const startsAt = dayjs(rule.startsAt).startOf("month");
  const endsAt = rule.endsAt ? dayjs(rule.endsAt).endOf("month") : null;

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
  return rules
    .filter((rule) => rule.isActive && rule.portfolioId === portfolioId)
    .filter((rule) => isRecurringRuleDue(rule, date))
    .filter((rule) => !hasGeneratedRecurringTransaction(rule, transactions, date))
    .map((rule) => buildRecurringTransaction({ rule, date, id: createId() }));
}
