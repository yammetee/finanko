import { getSupabaseClient } from "../../shared/api/supabase";
import type { Category, Expense } from "../../shared/types/expense";
import type { ExpenseSnapshot } from "./expenseTypes";

type Row = Record<string, unknown>;

async function client() {
  const value = await getSupabaseClient();
  if (!value) throw new Error("Supabase is not configured");
  return value;
}

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

export async function loadExpenseData(): Promise<ExpenseSnapshot> {
  const supabase = await client();
  const [categories, expenses] = await Promise.all([
    supabase.from("categories").select("id,name,color,created_at").order("created_at"),
    supabase
      .from("expenses")
      .select("id,amount,currency,category_id,description,occurred_at,source,deleted_at")
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false }),
  ]);
  const error = [categories, expenses].find((result) => result.error)?.error;
  if (error) throw error;

  return {
    categories: (categories.data ?? []).map((row) => categoryFromRow(row as Row)),
    expenses: (expenses.data ?? []).map((row) => expenseFromRow(row as Row)),
  };
}

export async function saveCategories(categories: Category[], ownerId: string) {
  if (categories.length === 0) return;
  const supabase = await client();
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
  const supabase = await client();
  const { error } = await supabase.rpc("save_expenses", {
    expense_rows: expenses.map(expenseRow),
  });
  if (error) throw error;
}
