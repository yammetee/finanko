import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import type {
  Account,
  Category,
  Currency,
  Timeframe,
  Transaction,
} from "../../shared/types/finance";

dayjs.extend(isoWeek);

export function getPeriod(timeframe: Timeframe) {
  const now = dayjs();
  if (timeframe === "all") {
    return null;
  }
  if (timeframe === "week") {
    return { start: now.subtract(6, "day").startOf("day"), end: now.endOf("day") };
  }
  if (timeframe === "year") {
    return { start: now.subtract(359, "day").startOf("day"), end: now.endOf("day") };
  }
  return { start: now.subtract(29, "day").startOf("day"), end: now.endOf("day") };
}

export function filterVisibleTransactions(
  transactions: Transaction[],
  portfolioId: string,
) {
  return transactions.filter(
    (transaction) => transaction.portfolioId === portfolioId && !transaction.deletedAt,
  );
}

export function filterPeriodTransactions(
  transactions: Transaction[],
  timeframe: Timeframe,
) {
  const period = getPeriod(timeframe);
  if (!period) return transactions;
  return transactions.filter((transaction) => {
    const occurredAt = dayjs(transaction.occurredAt);
    return !occurredAt.isBefore(period.start) && !occurredAt.isAfter(period.end);
  });
}

export function getAccountBalance(account: Account, transactions: Transaction[]) {
  return transactions
    .filter((transaction) => transaction.accountId === account.id)
    .reduce((balance, transaction) => {
      if (transaction.type === "income") return balance + transaction.amount;
      if (transaction.type === "expense") return balance - transaction.amount;
      return balance + transaction.amount;
    }, account.initialBalance);
}

function getTrendLabel(date: dayjs.Dayjs, timeframe: Timeframe) {
  if (timeframe === "year") return date.format("MMM YYYY");
  if (timeframe === "all") return date.format("MMM D");
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

function buildTimeBuckets(transactions: Transaction[], timeframe: Timeframe) {
  const now = dayjs();

  if (timeframe === "week") {
    return Array.from({ length: 7 }, (_, index) => {
      const date = now.subtract(6 - index, "day").startOf("day");
      return { key: getBucketKey(date, timeframe), date, label: getTrendLabel(date, timeframe) };
    });
  }

  if (timeframe === "month") {
    return Array.from({ length: 30 }, (_, index) => {
      const date = now.subtract(29 - index, "day").startOf("day");
      return { key: getBucketKey(date, timeframe), date, label: getTrendLabel(date, timeframe) };
    });
  }

  if (timeframe === "year") {
    return Array.from({ length: 12 }, (_, index) => {
      const date = now.subtract(11 - index, "month").startOf("month");
      return { key: getBucketKey(date, timeframe), date, label: getTrendLabel(date, timeframe) };
    });
  }

  const transactionDates = transactions
    .map((transaction) => dayjs(transaction.occurredAt).startOf("day"))
    .sort((a, b) => a.valueOf() - b.valueOf());
  const first = transactionDates[0] ?? now.startOf("day");
  const last = transactionDates[transactionDates.length - 1] ?? now.startOf("day");
  const days = Math.max(7, last.diff(first, "day") + 1);
  const start = last.subtract(days - 1, "day").startOf("day");

  return Array.from({ length: days }, (_, index) => {
    const date = start.add(index, "day");
    return { key: getBucketKey(date, timeframe), date, label: getTrendLabel(date, timeframe) };
  });
}

function getInitialBaseBalance(accounts: Account[], baseCurrency: Currency) {
  return accounts
    .filter((account) => account.currency === baseCurrency)
    .reduce((sum, account) => sum + account.initialBalance, 0);
}

function buildNetWorthTrend(
  accounts: Account[],
  transactions: Transaction[],
  timeframe: Timeframe,
  baseCurrency: Currency,
) {
  const baseTransactions = transactions
    .filter((transaction) => transaction.currency === baseCurrency)
    .sort((a, b) => +new Date(a.occurredAt) - +new Date(b.occurredAt));
  const buckets = buildTimeBuckets(baseTransactions, timeframe);
  const firstBucketDate = buckets[0]?.date ?? dayjs();
  const bucketDeltaMap = new Map(buckets.map((bucket) => [bucket.key, 0]));
  let runningNetWorth = getInitialBaseBalance(accounts, baseCurrency);

  for (const transaction of baseTransactions) {
    const occurredAt = dayjs(transaction.occurredAt);
    const delta =
      transaction.type === "expense" ? -transaction.amount : transaction.amount;

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

export function buildAnalytics(
  accounts: Account[],
  categories: Category[],
  transactions: Transaction[],
  timeframe: Timeframe,
  baseCurrency: Currency,
) {
  const periodTransactions = filterPeriodTransactions(transactions, timeframe).filter(
    (transaction) => transaction.currency === baseCurrency,
  );
  const income = periodTransactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const expenses = periodTransactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalBalance = accounts
    .filter((account) => account.currency === baseCurrency)
    .reduce(
    (sum, account) => sum + getAccountBalance(account, transactions),
    0,
  );
  const savingsTotal = accounts
    .filter((account) => account.currency === baseCurrency && account.type === "savings")
    .reduce((sum, account) => sum + getAccountBalance(account, transactions), 0);
  const debtTotal = accounts
    .filter((account) => account.currency === baseCurrency && account.type === "debt")
    .reduce((sum, account) => sum + Math.abs(getAccountBalance(account, transactions)), 0);
  const netWorth = totalBalance;

  const byCategory = categories
    .filter((category) => category.type === "expense")
    .map((category) => ({
      id: category.id,
      name: category.name,
      value: periodTransactions
        .filter(
          (transaction) =>
            transaction.type === "expense" && transaction.categoryId === category.id,
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0),
      fill: category.color,
    }))
    .filter((item) => item.value > 0);

  const buckets = buildTimeBuckets(periodTransactions, timeframe);
  const trendMap = new Map(
    buckets.map((bucket) => [
      bucket.key,
      { label: bucket.label, income: 0, expenses: 0 },
    ]),
  );
  periodTransactions.forEach((transaction) => {
    const occurredAt = dayjs(transaction.occurredAt);
    const key = getBucketKey(getBucketStart(occurredAt, timeframe), timeframe);
    const current =
      trendMap.get(key) ?? {
        label: getTrendLabel(occurredAt, timeframe),
        income: 0,
        expenses: 0,
      };
    if (transaction.type === "income") current.income += transaction.amount;
    if (transaction.type === "expense") current.expenses += transaction.amount;
    trendMap.set(key, current);
  });

  return {
    income,
    expenses,
    net: income - expenses,
    totalBalance,
    savingsTotal,
    debtTotal,
    netWorth,
    byCategory,
    trend: Array.from(trendMap.values()),
    netWorthTrend: buildNetWorthTrend(accounts, transactions, timeframe, baseCurrency),
  };
}
