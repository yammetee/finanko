import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import type { Currency, Timeframe } from "../../shared/types/finance";
import { convertMoney } from "../../shared/lib/currency";
import { isLiabilityAccountType } from "../../shared/lib/accounts";
import { minorToDecimal } from "./money";
import type { LedgerAccount, LedgerCategory, LedgerEntry, Posting } from "./ledgerTypes";
import { getLedgerAccountBalanceInCurrency } from "./balances";
import { getPostingDelta } from "./postings";

dayjs.extend(isoWeek);

export interface LedgerAnalytics {
  income: number;
  expenses: number;
  net: number;
  totalBalance: number;
  debtTotal: number;
  netWorth: number;
  byCategory: Array<{ id: string; name: string; value: number; fill: string }>;
  trend: Array<{ label: string; income: number; expenses: number }>;
  netWorthTrend: Array<{ label: string; netWorth: number }>;
}

export function getPeriod(timeframe: Timeframe, now = dayjs()) {
  if (timeframe === "all") return null;
  if (timeframe === "week") return { start: now.startOf("isoWeek"), end: now.endOf("isoWeek") };
  if (timeframe === "year") return { start: now.startOf("year"), end: now.endOf("year") };
  return { start: now.startOf("month"), end: now.endOf("month") };
}

export function filterPeriodEntries(entries: LedgerEntry[], timeframe: Timeframe, now = dayjs()) {
  const period = getPeriod(timeframe, now);
  if (!period) return entries.filter((entry) => !entry.deletedAt);

  return entries.filter((entry) => {
    if (entry.deletedAt) return false;
    const occurredAt = dayjs(entry.occurredAt);
    return !occurredAt.isBefore(period.start) && !occurredAt.isAfter(period.end);
  });
}

function categoryAmount(posting: Posting, occurredAt: string, baseCurrency: Currency) {
  return convertMoney(
    minorToDecimal(getPostingDelta(posting), posting.currency),
    posting.currency,
    baseCurrency,
    occurredAt,
  );
}

function isIncomePosting(posting: Posting) {
  return Boolean(posting.categoryId) && posting.role === "income";
}

function isExpensePosting(posting: Posting) {
  return (
    Boolean(posting.categoryId) &&
    (posting.role === "expense" || posting.role === "liability_interest")
  );
}

function getTrendLabel(date: dayjs.Dayjs, timeframe: Timeframe) {
  if (timeframe === "year") return date.format("MMM YYYY");
  return date.format("MMM D");
}

function getBucketKey(date: dayjs.Dayjs, timeframe: Timeframe) {
  if (timeframe === "year") return date.startOf("month").format("YYYY-MM");
  return date.startOf("day").format("YYYY-MM-DD");
}

function getBucketStart(date: dayjs.Dayjs, timeframe: Timeframe) {
  if (timeframe === "year") return date.startOf("month");
  return date.startOf("day");
}

function buildTimeBuckets(entries: LedgerEntry[], timeframe: Timeframe, now = dayjs()) {
  if (timeframe === "week") {
    const start = now.startOf("isoWeek");
    return Array.from({ length: 7 }, (_, index) => {
      const date = start.add(index, "day").startOf("day");
      return { key: getBucketKey(date, timeframe), date, label: getTrendLabel(date, timeframe) };
    });
  }

  if (timeframe === "month") {
    const start = now.startOf("month");
    return Array.from({ length: now.daysInMonth() }, (_, index) => {
      const date = start.add(index, "day").startOf("day");
      return { key: getBucketKey(date, timeframe), date, label: getTrendLabel(date, timeframe) };
    });
  }

  if (timeframe === "year") {
    const start = now.startOf("year");
    return Array.from({ length: 12 }, (_, index) => {
      const date = start.add(index, "month").startOf("month");
      return { key: getBucketKey(date, timeframe), date, label: getTrendLabel(date, timeframe) };
    });
  }

  const dates = entries
    .map((entry) => dayjs(entry.occurredAt).startOf("day"))
    .sort((a, b) => a.valueOf() - b.valueOf());
  const first = dates[0] ?? now.startOf("day");
  const last = dates[dates.length - 1] ?? now.startOf("day");
  const days = Math.max(7, last.diff(first, "day") + 1);
  const start = last.subtract(days - 1, "day").startOf("day");

  return Array.from({ length: days }, (_, index) => {
    const date = start.add(index, "day");
    return { key: getBucketKey(date, timeframe), date, label: getTrendLabel(date, timeframe) };
  });
}

function getEntryPortfolioDelta(entry: LedgerEntry, baseCurrency: Currency) {
  return entry.postings
    .filter((posting) => posting.accountId)
    .reduce((sum, posting) => {
      const delta = getPostingDelta(posting);
      return (
        sum +
        convertMoney(
          minorToDecimal(delta, posting.currency),
          posting.currency,
          baseCurrency,
          entry.occurredAt,
        )
      );
    }, 0);
}

function buildNetWorthTrend(
  accounts: LedgerAccount[],
  entries: LedgerEntry[],
  timeframe: Timeframe,
  baseCurrency: Currency,
  now = dayjs(),
) {
  const buckets = buildTimeBuckets(entries, timeframe, now);
  const bucketDeltaMap = new Map(buckets.map((bucket) => [bucket.key, 0]));
  const firstBucketDate = buckets[0]?.date ?? now;
  const openingNetWorth = accounts.reduce(
    (sum, account) =>
      sum +
      convertMoney(
        minorToDecimal(account.openingBalanceMinor, account.currency),
        account.currency,
        baseCurrency,
      ),
    0,
  );
  let runningNetWorth = openingNetWorth;

  for (const entry of [...entries].sort((a, b) => +new Date(a.occurredAt) - +new Date(b.occurredAt))) {
    if (entry.deletedAt) continue;
    const occurredAt = dayjs(entry.occurredAt);
    const delta = getEntryPortfolioDelta(entry, baseCurrency);

    if (occurredAt.isBefore(firstBucketDate)) {
      runningNetWorth += delta;
      continue;
    }

    const key = getBucketKey(getBucketStart(occurredAt, timeframe), timeframe);
    if (bucketDeltaMap.has(key)) {
      bucketDeltaMap.set(key, (bucketDeltaMap.get(key) ?? 0) + delta);
    }
  }

  return buckets.map((bucket) => {
    runningNetWorth += bucketDeltaMap.get(bucket.key) ?? 0;
    return { label: bucket.label, netWorth: runningNetWorth };
  });
}

export function buildLedgerAnalytics(
  accounts: LedgerAccount[],
  categories: Array<LedgerCategory & { name: string; color: string }>,
  entries: LedgerEntry[],
  timeframe: Timeframe,
  baseCurrency: Currency,
  now = dayjs(),
): LedgerAnalytics {
  const periodEntries = filterPeriodEntries(entries, timeframe, now);

  const income = periodEntries.reduce(
    (sum, entry) =>
      sum +
      entry.postings
        .filter(isIncomePosting)
        .reduce((postingSum, posting) => postingSum + categoryAmount(posting, entry.occurredAt, baseCurrency), 0),
    0,
  );
  const expenses = periodEntries.reduce(
    (sum, entry) =>
      sum +
      entry.postings
        .filter(isExpensePosting)
        .reduce((postingSum, posting) => postingSum + categoryAmount(posting, entry.occurredAt, baseCurrency), 0),
    0,
  );
  const totalBalance = accounts.reduce(
    (sum, account) => sum + getLedgerAccountBalanceInCurrency(account, entries, baseCurrency),
    0,
  );
  const debtTotal = accounts
    .filter((account) => isLiabilityAccountType(account.type))
    .reduce((sum, account) => sum + Math.abs(getLedgerAccountBalanceInCurrency(account, entries, baseCurrency)), 0);

  const byCategory = categories
    .filter((category) => category.type === "expense")
    .map((category) => ({
      id: category.id,
      name: category.name,
      value: periodEntries.reduce(
        (sum, entry) =>
          sum +
          entry.postings
            .filter((posting) => posting.categoryId === category.id && isExpensePosting(posting))
            .reduce((postingSum, posting) => postingSum + categoryAmount(posting, entry.occurredAt, baseCurrency), 0),
        0,
      ),
      fill: category.color,
    }))
    .filter((item) => item.value > 0);

  const buckets = buildTimeBuckets(periodEntries, timeframe, now);
  const trendMap = new Map(buckets.map((bucket) => [bucket.key, { label: bucket.label, income: 0, expenses: 0 }]));
  periodEntries.forEach((entry) => {
    const occurredAt = dayjs(entry.occurredAt);
    const key = getBucketKey(getBucketStart(occurredAt, timeframe), timeframe);
    const current = trendMap.get(key) ?? { label: getTrendLabel(occurredAt, timeframe), income: 0, expenses: 0 };
    entry.postings.forEach((posting) => {
      if (isIncomePosting(posting)) current.income += categoryAmount(posting, entry.occurredAt, baseCurrency);
      if (isExpensePosting(posting)) current.expenses += categoryAmount(posting, entry.occurredAt, baseCurrency);
    });
    trendMap.set(key, current);
  });

  return {
    income,
    expenses,
    net: income - expenses,
    totalBalance,
    debtTotal,
    netWorth: totalBalance,
    byCategory,
    trend: Array.from(trendMap.values()),
    netWorthTrend: buildNetWorthTrend(accounts, entries, timeframe, baseCurrency, now),
  };
}
