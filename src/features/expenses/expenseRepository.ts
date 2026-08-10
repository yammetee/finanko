import { requireSupabaseClient } from "../../shared/api/supabase";
import type { Category, Expense } from "../../shared/types/expense";
import type { ExpenseRange, ExpenseSnapshot } from "./expenseTypes";

type Row = Record<string, unknown>;

function categoryFromRow(row: Row): Category {
  return {
    id: String(row.id),
    name: String(row.name),
    color: String(row.color),
  };
}

function expenseFromRow(row: Row): Expense {
  return {
    id: String(row.id),
    amount: Number(row.amount),
    currency: row.currency as Expense["currency"],
    categoryId: String(row.category_id),
    description: String(row.description),
    occurredAt: String(row.occurred_at),
    source: row.source as Expense["source"],
    deletedAt: (row.deleted_at as string) ?? undefined,
  };
}

const EXPENSE_PAGE_SIZE = 500;

export function expenseRangeKey(range: ExpenseRange) {
  return `${range.start ?? "*"}:${range.end ?? "*"}`;
}

async function loadExpenses(range: ExpenseRange) {
  const supabase = await requireSupabaseClient();
  const rows: Row[] = [];
  let cursor: { occurredAt: string; id: string } | undefined;
  do {
    let query = supabase
      .from("expenses")
      .select("id,amount,currency,category_id,description,occurred_at,source,deleted_at")
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(EXPENSE_PAGE_SIZE);
    if (range.start) query = query.gte("occurred_at", range.start);
    if (range.end) query = query.lte("occurred_at", range.end);
    if (cursor) {
      const occurredAt = `"${cursor.occurredAt}"`;
      query = query.or(`occurred_at.lt.${occurredAt},and(occurred_at.eq.${occurredAt},id.lt.${cursor.id})`);
    }
    const result = await query;
    if (result.error) throw result.error;
    const page = (result.data ?? []) as Row[];
    rows.push(...page);
    const last = page[page.length - 1];
    cursor = page.length === EXPENSE_PAGE_SIZE && last
      ? { occurredAt: String(last.occurred_at), id: String(last.id) }
      : undefined;
  } while (cursor);
  return rows.map(expenseFromRow);
}

export async function loadExpenseTrackingStart() {
  const supabase = await requireSupabaseClient();
  const { data, error } = await supabase
    .from("expenses")
    .select("occurred_at")
    .is("deleted_at", null)
    .order("occurred_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.occurred_at ? String(data.occurred_at) : undefined;
}

export async function loadExpenseData(range: ExpenseRange): Promise<ExpenseSnapshot> {
  const supabase = await requireSupabaseClient();
  const [categories, expenses] = await Promise.all([
    supabase.from("categories").select("id,name,color,created_at").order("created_at"),
    loadExpenses(range),
  ]);
  if (categories.error) throw categories.error;

  return {
    categories: (categories.data ?? []).map((row) => categoryFromRow(row as Row)),
    expenses,
  };
}

export { loadExpenses };

export async function saveCategories(categories: Category[], ownerId: string) {
  if (categories.length === 0) return;
  const supabase = await requireSupabaseClient();
  const { error } = await supabase.from("categories").upsert(
    categories.map((category) => ({
      id: category.id,
      owner_id: ownerId,
      name: category.name,
      color: category.color,
    })),
    { onConflict: "owner_id,name", ignoreDuplicates: true },
  );
  if (error) throw error;
}

function expenseRow(expense: Expense) {
  return {
    id: expense.id,
    amount: expense.amount,
    currency: expense.currency,
    category_id: expense.categoryId,
    description: expense.description,
    occurred_at: expense.occurredAt,
    source: expense.source,
    deleted_at: expense.deletedAt ?? null,
  };
}

export async function saveExpenses(expenses: Expense[]) {
  const supabase = await requireSupabaseClient();
  const { error } = await supabase.rpc("save_expenses", {
    expense_rows: expenses.map(expenseRow),
  });
  if (error) throw error;
}
