import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import type {
  Account,
  Category,
  Currency,
  Timeframe,
  Transaction,
} from "../../shared/types/finance";
import { convertMoney } from "../../shared/lib/currency";
import { applyAccountInterest, getAccountInterestGain } from "../../shared/lib/interest";
import {
  isLiabilityAccount,
  normalizeAccountInitialBalance,
} from "../../shared/lib/accounts";

dayjs.extend(isoWeek);

export function getPeriod(timeframe: Timeframe) {
  const now = dayjs();
  if (timeframe === "all") {
    return null;
  }
  if (timeframe === "week") {
    return { start: now.startOf("isoWeek"), end: now.endOf("isoWeek") };
  }
  if (timeframe === "year") {
    return { start: now.startOf("year"), end: now.endOf("year") };
  }
  return { start: now.startOf("month"), end: now.endOf("month") };
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

function getRawAccountBalance(account: Account, transactions: Transaction[]) {
  return transactions
    .filter((transaction) => transaction.accountId === account.id)
    .reduce((balance, transaction) => {
      const amount = convertMoney(
        transaction.amount,
        transaction.currency,
        account.currency,
        transaction.occurredAt,
      );
      if (transaction.type === "income") return balance + amount;
      if (transaction.type === "expense") return balance - amount;
      return balance + amount;
    }, normalizeAccountInitialBalance(account.type, account.initialBalance));
}

function getAllocatedInterestBalance(
  account: Account,
  transactions: Transaction[],
  accounts: Account[],
) {
  return accounts
    .filter((source) => source.interestAllocationAccountId === account.id)
    .reduce((sum, source) => {
      const rawBalance = getRawAccountBalance(source, transactions);
      const gain = getAccountInterestGain(rawBalance, source);
      return sum + convertMoney(gain, source.currency, account.currency);
    }, 0);
}

export function getAccountBalance(
  account: Account,
  transactions: Transaction[],
  accounts: Account[] = [account],
) {
  const rawBalance = getRawAccountBalance(account, transactions);
  const ownBalance = account.interestAllocationAccountId
    ? rawBalance
    : applyAccountInterest(rawBalance, account);
  return ownBalance + getAllocatedInterestBalance(account, transactions, accounts);
}

export function getAccountBalanceInCurrency(
  account: Account,
  transactions: Transaction[],
  currency: Currency,
  date?: string,
  accounts: Account[] = [account],
) {
  const balance = getAccountBalance(account, transactions, accounts);
  return convertMoney(balance, account.currency, currency, date);
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
    .reduce(
      (sum, account) =>
        sum +
        getAccountBalanceInCurrency(account, [], baseCurrency, undefined, accounts),
      0,
    );
}

function buildNetWorthTrend(
  accounts: Account[],
  transactions: Transaction[],
  timeframe: Timeframe,
  baseCurrency: Currency,
) {
  const baseTransactions = [...transactions].sort(
    (a, b) => +new Date(a.occurredAt) - +new Date(b.occurredAt),
  );
  const buckets = buildTimeBuckets(baseTransactions, timeframe);
  const firstBucketDate = buckets[0]?.date ?? dayjs();
  const bucketDeltaMap = new Map(buckets.map((bucket) => [bucket.key, 0]));
  let runningNetWorth = getInitialBaseBalance(accounts, baseCurrency);

  for (const transaction of baseTransactions) {
    const occurredAt = dayjs(transaction.occurredAt);
    const delta =
      transaction.type === "expense"
        ? -convertMoney(transaction.amount, transaction.currency, baseCurrency, transaction.occurredAt)
        : convertMoney(transaction.amount, transaction.currency, baseCurrency, transaction.occurredAt);

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
  const periodTransactions = filterPeriodTransactions(transactions, timeframe);
  const income = periodTransactions
    .filter((transaction) => transaction.type === "income")
    .reduce(
      (sum, transaction) =>
        sum + convertMoney(transaction.amount, transaction.currency, baseCurrency, transaction.occurredAt),
      0,
    );
  const expenses = periodTransactions
    .filter((transaction) => transaction.type === "expense")
    .reduce(
      (sum, transaction) =>
        sum + convertMoney(transaction.amount, transaction.currency, baseCurrency, transaction.occurredAt),
      0,
    );
  const totalBalance = accounts
    .reduce(
      (sum, account) =>
        sum + getAccountBalanceInCurrency(account, transactions, baseCurrency, undefined, accounts),
      0,
    );
  const savingsTotal = accounts
    .filter((account) => account.type === "savings")
    .reduce(
      (sum, account) =>
        sum + getAccountBalanceInCurrency(account, transactions, baseCurrency, undefined, accounts),
      0,
    );
  const debtTotal = accounts
    .filter(isLiabilityAccount)
    .reduce(
      (sum, account) =>
        sum +
        Math.abs(getAccountBalanceInCurrency(account, transactions, baseCurrency, undefined, accounts)),
      0,
    );
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
        .reduce(
          (sum, transaction) =>
            sum +
            convertMoney(
              transaction.amount,
              transaction.currency,
              baseCurrency,
              transaction.occurredAt,
            ),
          0,
        ),
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
    if (transaction.type === "income") {
      current.income += convertMoney(
        transaction.amount,
        transaction.currency,
        baseCurrency,
        transaction.occurredAt,
      );
    }
    if (transaction.type === "expense") {
      current.expenses += convertMoney(
        transaction.amount,
        transaction.currency,
        baseCurrency,
        transaction.occurredAt,
      );
    }
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
