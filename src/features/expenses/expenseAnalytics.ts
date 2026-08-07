import dayjs, { type Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { convertMoney } from "../../shared/lib/currency";
import type {
  Category,
  Currency,
  Transaction,
  TransactionItem,
} from "../../shared/types/finance";

dayjs.extend(isoWeek);

export const UNALLOCATED_CATEGORY_KEY = "__unallocated__";

export type ExpensePeriod = "today" | "week" | "month" | "year" | "all" | "custom";

export interface ExpenseFilters {
  period: ExpensePeriod;
  categoryKeys: string[];
  customRange?: [string, string];
}

export interface ExpenseCategoryGroup {
  key: string;
  name: string;
  color: string;
  categoryIds: string[];
}

export interface ExpenseHistoryEntry {
  transaction: Transaction;
  contribution: number;
}

export interface ExpenseTrendBucket {
  key: string;
  start: string;
  end: string;
  value: number;
  transactionCount: number;
  unit: "hour" | "day" | "month" | "year";
}

interface ExpenseViewInput {
  transactions: Transaction[];
  transactionItems: TransactionItem[];
  categories: Category[];
  portfolioIds: string[];
  filters: ExpenseFilters;
  displayCurrency: Currency;
  now?: Dayjs;
}

interface PeriodRange {
  start: Dayjs;
  end: Dayjs;
}

export function categoryGroupKey(name: string) {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function buildExpenseCategoryGroups(
  categories: Category[],
  getName: (category: Category) => string = (category) => category.name,
): ExpenseCategoryGroup[] {
  const groups = new Map<string, ExpenseCategoryGroup>();

  categories
    .filter((category) => category.type === "expense")
    .forEach((category) => {
      const key = categoryGroupKey(category.name);
      const current = groups.get(key);
      if (current) {
        current.categoryIds.push(category.id);
        return;
      }

      groups.set(key, {
        key,
        name: getName(category),
        color: category.color,
        categoryIds: [category.id],
      });
    });

  return [...groups.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export function getExpensePeriodRange(
  filters: Pick<ExpenseFilters, "period" | "customRange">,
  now = dayjs(),
): PeriodRange | null {
  if (filters.period === "all") return null;
  if (filters.period === "today") {
    return { start: now.startOf("day"), end: now.endOf("day") };
  }
  if (filters.period === "week") {
    return { start: now.startOf("isoWeek"), end: now.endOf("isoWeek") };
  }
  if (filters.period === "year") {
    return { start: now.startOf("year"), end: now.endOf("year") };
  }
  if (filters.period === "custom" && filters.customRange) {
    return {
      start: dayjs(filters.customRange[0]).startOf("day"),
      end: dayjs(filters.customRange[1]).endOf("day"),
    };
  }
  return { start: now.startOf("month"), end: now.endOf("month") };
}

function trendRange(
  history: ExpenseHistoryEntry[],
  filters: ExpenseFilters,
  now: Dayjs,
): PeriodRange | null {
  const selectedRange = getExpensePeriodRange(filters, now);
  if (selectedRange) {
    return selectedRange;
  }
  if (history.length === 0) return null;

  const timestamps = history.map((entry) => dayjs(entry.transaction.occurredAt));
  return {
    start: timestamps.reduce((earliest, value) => value.isBefore(earliest) ? value : earliest)
      .startOf("month"),
    end: timestamps.reduce((latest, value) => value.isAfter(latest) ? value : latest)
      .endOf("month"),
  };
}

export function buildExpenseTrendBuckets(
  history: ExpenseHistoryEntry[],
  filters: ExpenseFilters,
  now = dayjs(),
): ExpenseTrendBucket[] {
  const range = trendRange(history, filters, now);
  if (!range || range.end.isBefore(range.start)) return [];

  const dayCount = range.end.startOf("day").diff(range.start.startOf("day"), "day") + 1;
  const unit: ExpenseTrendBucket["unit"] = filters.period === "today"
    ? "hour"
    : filters.period === "week" || filters.period === "month"
      ? "day"
      : filters.period === "year" || filters.period === "all"
        ? "month"
        : dayCount <= 62
          ? "day"
          : dayCount <= 730
            ? "month"
            : "year";
  const buckets: Array<{ start: Dayjs; end: Dayjs }> = [];
  let cursor = unit === "day" ? range.start.startOf("day") : range.start.startOf(unit);

  while (!cursor.isAfter(range.end)) {
    const bucketEnd = cursor.endOf(unit);
    buckets.push({
      start: cursor.isBefore(range.start) ? range.start : cursor,
      end: bucketEnd.isAfter(range.end) ? range.end : bucketEnd,
    });
    cursor = bucketEnd.add(1, "millisecond");
  }

  return buckets.map((bucket) => {
    const entries = history.filter((entry) => {
      const occurredAt = dayjs(entry.transaction.occurredAt);
      return !occurredAt.isBefore(bucket.start) && !occurredAt.isAfter(bucket.end);
    });
    return {
      key: `${bucket.start.toISOString()}-${bucket.end.toISOString()}`,
      start: bucket.start.toISOString(),
      end: bucket.end.toISOString(),
      value: entries.reduce((sum, entry) => sum + entry.contribution, 0),
      transactionCount: entries.length,
      unit,
    };
  });
}

function isInsidePeriod(transaction: Transaction, range: PeriodRange | null) {
  if (!range) return true;
  const occurredAt = dayjs(transaction.occurredAt);
  return !occurredAt.isBefore(range.start) && !occurredAt.isAfter(range.end);
}

function contributionForTransaction(
  transaction: Transaction,
  items: TransactionItem[],
  selectedKeys: Set<string>,
  categoryKeyById: Map<string, string>,
) {
  if (selectedKeys.size === 0) return transaction.amount;

  if (items.length === 0) {
    const key = categoryKeyById.get(transaction.categoryId) ?? UNALLOCATED_CATEGORY_KEY;
    return selectedKeys.has(key) ? transaction.amount : 0;
  }

  const itemTotal = items.reduce((sum, item) => sum + item.amount, 0);
  const itemContribution = items.reduce((sum, item) => {
    const key = categoryKeyById.get(item.categoryId) ?? UNALLOCATED_CATEGORY_KEY;
    return selectedKeys.has(key) ? sum + item.amount : sum;
  }, 0);
  const unallocated = transaction.amount - itemTotal;

  return selectedKeys.has(UNALLOCATED_CATEGORY_KEY)
    ? itemContribution + unallocated
    : itemContribution;
}

export function buildExpenseView({
  transactions,
  transactionItems,
  categories,
  portfolioIds,
  filters,
  displayCurrency,
  now = dayjs(),
}: ExpenseViewInput) {
  const portfolioIdSet = new Set(portfolioIds);
  const categoryGroups = buildExpenseCategoryGroups(categories);
  const categoryKeyById = new Map(
    categoryGroups.flatMap((group) => group.categoryIds.map((id) => [id, group.key] as const)),
  );
  const itemsByTransaction = new Map<string, TransactionItem[]>();
  transactionItems.forEach((item) => {
    itemsByTransaction.set(item.transactionId, [
      ...(itemsByTransaction.get(item.transactionId) ?? []),
      item,
    ]);
  });

  const range = getExpensePeriodRange(filters, now);
  const periodExpenses = transactions.filter(
    (transaction) =>
      transaction.type === "expense" &&
      !transaction.deletedAt &&
      portfolioIdSet.has(transaction.portfolioId) &&
      isInsidePeriod(transaction, range),
  );
  const selectedKeys = new Set(filters.categoryKeys);
  const history: ExpenseHistoryEntry[] = periodExpenses
    .map((transaction) => {
      const nativeContribution = contributionForTransaction(
        transaction,
        itemsByTransaction.get(transaction.id) ?? [],
        selectedKeys,
        categoryKeyById,
      );
      return {
        transaction,
        contribution: convertMoney(
          nativeContribution,
          transaction.currency,
          displayCurrency,
          transaction.occurredAt,
        ),
      };
    })
    .filter((entry) => Math.abs(entry.contribution) >= 0.005)
    .sort(
      (left, right) =>
        +new Date(right.transaction.occurredAt) - +new Date(left.transaction.occurredAt),
    );

  const categoryTotals = new Map<string, number>();
  periodExpenses.forEach((transaction) => {
    const items = itemsByTransaction.get(transaction.id) ?? [];
    if (items.length === 0) {
      const key = categoryKeyById.get(transaction.categoryId) ?? UNALLOCATED_CATEGORY_KEY;
      categoryTotals.set(
        key,
        (categoryTotals.get(key) ?? 0) +
          convertMoney(transaction.amount, transaction.currency, displayCurrency, transaction.occurredAt),
      );
      return;
    }

    const itemTotal = items.reduce((sum, item) => sum + item.amount, 0);
    items.forEach((item) => {
      const key = categoryKeyById.get(item.categoryId) ?? UNALLOCATED_CATEGORY_KEY;
      categoryTotals.set(
        key,
        (categoryTotals.get(key) ?? 0) +
          convertMoney(item.amount, transaction.currency, displayCurrency, transaction.occurredAt),
      );
    });

    const unallocated = transaction.amount - itemTotal;
    if (Math.abs(unallocated) >= 0.005) {
      categoryTotals.set(
        UNALLOCATED_CATEGORY_KEY,
        (categoryTotals.get(UNALLOCATED_CATEGORY_KEY) ?? 0) +
          convertMoney(unallocated, transaction.currency, displayCurrency, transaction.occurredAt),
      );
    }
  });

  const categoryMeta = new Map(categoryGroups.map((group) => [group.key, group]));
  const byCategory = [...categoryTotals.entries()]
    .filter(([key, value]) =>
      Math.abs(value) >= 0.005 && (selectedKeys.size === 0 || selectedKeys.has(key)),
    )
    .map(([key, value]) => ({
      key,
      name: categoryMeta.get(key)?.name ?? "Unallocated",
      color: categoryMeta.get(key)?.color ?? "#7f93a6",
      value,
    }))
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value));

  return {
    total: history.reduce((sum, entry) => sum + entry.contribution, 0),
    history,
    byCategory,
    periodExpenses,
  };
}

export function buildExpenseBaseline(input: {
  transactions: Transaction[];
  transactionItems: TransactionItem[];
}) {
  const expenses = input.transactions.filter(
    (transaction) => transaction.type === "expense" && !transaction.deletedAt,
  );
  const totalsByCurrency = expenses.reduce<Partial<Record<Currency, number>>>((totals, expense) => {
    totals[expense.currency] = (totals[expense.currency] ?? 0) + expense.amount;
    return totals;
  }, {});
  const countsByCategoryId = expenses.reduce<Record<string, number>>((counts, expense) => {
    const key = expense.categoryId || UNALLOCATED_CATEGORY_KEY;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const timestamps = expenses.map((expense) => +new Date(expense.occurredAt));
  const expenseIds = new Set(expenses.map((expense) => expense.id));

  return {
    expenseCount: expenses.length,
    itemCount: input.transactionItems.filter((item) => expenseIds.has(item.transactionId)).length,
    totalsByCurrency,
    countsByCategoryId,
    firstOccurredAt: timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null,
    lastOccurredAt: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null,
    expenseIds: expenses.map((expense) => expense.id).sort(),
  };
}
