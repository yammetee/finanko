import dayjs, { type Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { convertMoney } from "../../shared/lib/currency";
import type {
  Category,
  Currency,
  Expense,
  ExpenseItem,
} from "../../shared/types/expense";

dayjs.extend(isoWeek);

export const UNALLOCATED_CATEGORY_KEY = "__unallocated__";

export type ExpensePeriod = "today" | "week" | "month" | "year" | "all" | "custom";

export interface ExpenseFilters {
  period: ExpensePeriod;
  categoryKeys: string[];
  customRange?: [string, string];
}

interface ExpenseCategoryGroup {
  key: string;
  name: string;
  color: string;
  categoryIds: string[];
}

export interface ExpenseHistoryEntry {
  expense: Expense;
  contribution: number;
  nativeContribution?: number;
}

export interface ExpenseTrendBucket {
  key: string;
  start: string;
  end: string;
  value: number;
  expenseCount: number;
  unit: "hour" | "day" | "month" | "year";
}

interface ExpenseNativeCategoryTotal {
  key: string;
  name: string;
  color: string;
  currency: Currency;
  value: number;
  convertedValue: number;
}

interface ExpenseViewInput {
  expenses: Expense[];
  expenseItems: ExpenseItem[];
  categories: Category[];
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

function trendRange(history: ExpenseHistoryEntry[], filters: ExpenseFilters, now: Dayjs): PeriodRange | null {
  const selectedRange = getExpensePeriodRange(filters, now);
  if (selectedRange) return selectedRange;
  if (history.length === 0) return null;

  const timestamps = history.map((entry) => dayjs(entry.expense.occurredAt));
  return {
    start: timestamps.reduce((earliest, value) => value.isBefore(earliest) ? value : earliest).startOf("month"),
    end: timestamps.reduce((latest, value) => value.isAfter(latest) ? value : latest).endOf("month"),
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
        : dayCount <= 62 ? "day" : dayCount <= 730 ? "month" : "year";
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

  let cumulativeValue = 0;
  return buckets.map((bucket) => {
    const entries = history.filter((entry) => {
      const occurredAt = dayjs(entry.expense.occurredAt);
      return !occurredAt.isBefore(bucket.start) && !occurredAt.isAfter(bucket.end);
    });
    cumulativeValue += entries.reduce((sum, entry) => sum + entry.contribution, 0);
    return {
      key: `${bucket.start.toISOString()}-${bucket.end.toISOString()}`,
      start: bucket.start.toISOString(),
      end: bucket.end.toISOString(),
      value: cumulativeValue,
      expenseCount: entries.length,
      unit,
    };
  });
}

export function calculateAverageDailyExpense(
  history: ExpenseHistoryEntry[],
  filters: ExpenseFilters,
  total: number,
  now = dayjs(),
  trackingStartedAt?: string,
) {
  if (history.length === 0) return 0;

  const selectedRange = getExpensePeriodRange(filters, now);
  const periodStart = selectedRange?.start ?? history.reduce((earliest, entry) => {
    const occurredAt = dayjs(entry.expense.occurredAt);
    return occurredAt.isBefore(earliest) ? occurredAt : earliest;
  }, dayjs(history[0].expense.occurredAt));
  const trackingStart = trackingStartedAt ? dayjs(trackingStartedAt).startOf("day") : null;
  const start = trackingStart?.isAfter(periodStart) ? trackingStart : periodStart;
  const selectedEnd = selectedRange?.end ?? now;
  const latestExpense = history.reduce((latest, entry) => {
    const occurredAt = dayjs(entry.expense.occurredAt);
    return occurredAt.isAfter(latest) ? occurredAt : latest;
  }, dayjs(history[0].expense.occurredAt));
  const end = selectedRange
    ? (selectedEnd.isAfter(now) ? now : selectedEnd)
    : (latestExpense.isAfter(now) ? latestExpense : now);
  const dayCount = Math.max(1, end.startOf("day").diff(start.startOf("day"), "day") + 1);

  return total / dayCount;
}

export function getExpenseTrackingStart(
  expenses: Expense[],
) {
  const firstExpense = expenses
    .filter((expense) => !expense.deletedAt)
    .reduce<Expense | null>((earliest, expense) => {
      if (!earliest) return expense;
      return new Date(expense.occurredAt) < new Date(earliest.occurredAt)
        ? expense
        : earliest;
    }, null);

  return firstExpense?.occurredAt;
}

function isInsidePeriod(expense: Expense, range: PeriodRange | null) {
  if (!range) return true;
  const occurredAt = dayjs(expense.occurredAt);
  return !occurredAt.isBefore(range.start) && !occurredAt.isAfter(range.end);
}

function contributionForExpense(
  expense: Expense,
  items: ExpenseItem[],
  selectedKeys: Set<string>,
  categoryKeyById: Map<string, string>,
) {
  if (selectedKeys.size === 0) return expense.amount;

  if (items.length === 0) {
    const key = categoryKeyById.get(expense.categoryId) ?? UNALLOCATED_CATEGORY_KEY;
    return selectedKeys.has(key) ? expense.amount : 0;
  }

  const itemTotal = items.reduce((sum, item) => sum + item.amount, 0);
  const itemContribution = items.reduce((sum, item) => {
    const key = categoryKeyById.get(item.categoryId) ?? UNALLOCATED_CATEGORY_KEY;
    return selectedKeys.has(key) ? sum + item.amount : sum;
  }, 0);
  const unallocated = expense.amount - itemTotal;

  return selectedKeys.has(UNALLOCATED_CATEGORY_KEY)
    ? itemContribution + unallocated
    : itemContribution;
}

export function buildExpenseView({
  expenses,
  expenseItems,
  categories,
  filters,
  displayCurrency,
  now = dayjs(),
}: ExpenseViewInput) {
  const categoryGroups = buildExpenseCategoryGroups(categories);
  const categoryKeyById = new Map(
    categoryGroups.flatMap((group) => group.categoryIds.map((id) => [id, group.key] as const)),
  );
  const itemsByExpense = new Map<string, ExpenseItem[]>();
  expenseItems.forEach((item) => {
    itemsByExpense.set(item.expenseId, [
      ...(itemsByExpense.get(item.expenseId) ?? []),
      item,
    ]);
  });

  const range = getExpensePeriodRange(filters, now);
  const periodExpenses = expenses.filter(
    (expense) =>
      !expense.deletedAt &&
      isInsidePeriod(expense, range),
  );
  const selectedKeys = new Set(filters.categoryKeys);
  const history: ExpenseHistoryEntry[] = periodExpenses
    .map((expense) => {
      const nativeContribution = contributionForExpense(
        expense,
        itemsByExpense.get(expense.id) ?? [],
        selectedKeys,
        categoryKeyById,
      );
      return {
        expense,
        nativeContribution,
        contribution: convertMoney(
          nativeContribution,
          expense.currency,
          displayCurrency,
          expense.occurredAt,
        ),
      };
    })
    .filter((entry) => Math.abs(entry.contribution) >= 0.005)
    .sort(
      (left, right) =>
        +new Date(right.expense.occurredAt) - +new Date(left.expense.occurredAt),
    );

  const categoryTotals = new Map<string, number>();
  const nativeCategoryTotals = new Map<string, {
    key: string;
    currency: Currency;
    value: number;
    convertedValue: number;
  }>();
  const addCategoryAmount = (key: string, amount: number, expense: Expense) => {
    const convertedAmount = convertMoney(
      amount,
      expense.currency,
      displayCurrency,
      expense.occurredAt,
    );
    categoryTotals.set(key, (categoryTotals.get(key) ?? 0) + convertedAmount);

    const nativeKey = `${key}:${expense.currency}`;
    const current = nativeCategoryTotals.get(nativeKey);
    nativeCategoryTotals.set(nativeKey, {
      key,
      currency: expense.currency,
      value: (current?.value ?? 0) + amount,
      convertedValue: (current?.convertedValue ?? 0) + convertedAmount,
    });
  };

  periodExpenses.forEach((expense) => {
    const items = itemsByExpense.get(expense.id) ?? [];
    if (items.length === 0) {
      const key = categoryKeyById.get(expense.categoryId) ?? UNALLOCATED_CATEGORY_KEY;
      addCategoryAmount(key, expense.amount, expense);
      return;
    }

    const itemTotal = items.reduce((sum, item) => sum + item.amount, 0);
    items.forEach((item) => {
      const key = categoryKeyById.get(item.categoryId) ?? UNALLOCATED_CATEGORY_KEY;
      addCategoryAmount(key, item.amount, expense);
    });

    const unallocated = expense.amount - itemTotal;
    if (Math.abs(unallocated) >= 0.005) {
      addCategoryAmount(UNALLOCATED_CATEGORY_KEY, unallocated, expense);
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
  const nativeByCategory: ExpenseNativeCategoryTotal[] = [...nativeCategoryTotals.values()]
    .filter(({ key, value }) =>
      Math.abs(value) >= 0.005 && (selectedKeys.size === 0 || selectedKeys.has(key)),
    )
    .map(({ key, currency, value, convertedValue }) => ({
      key,
      name: categoryMeta.get(key)?.name ?? "Unallocated",
      color: categoryMeta.get(key)?.color ?? "#7f93a6",
      currency,
      value,
      convertedValue,
    }))
    .sort((left, right) => Math.abs(right.convertedValue) - Math.abs(left.convertedValue));

  return {
    total: history.reduce((sum, entry) => sum + entry.contribution, 0),
    history,
    byCategory,
    nativeByCategory,
    periodExpenses,
  };
}
