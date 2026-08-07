import { getSupabaseClient } from "../../shared/api/supabase";
import type { Category, Expense, ExpenseItem } from "../../shared/types/expense";
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

function itemFromRow(row: Row): ExpenseItem {
  return {
    id: String(row.id),
    expenseId: String(row.expense_id),
    name: String(row.name),
    amount: Number(row.amount),
    quantity: row.quantity == null ? undefined : Number(row.quantity),
    unitPrice: row.unit_price == null ? undefined : Number(row.unit_price),
    categoryId: String(row.category_id),
    confidence: Number(row.confidence),
  };
}

export async function loadExpenseData(): Promise<ExpenseSnapshot> {
  const supabase = await client();
  const [categories, expenses, items] = await Promise.all([
    supabase.from("categories").select("id,name,color,created_at").order("created_at"),
    supabase
      .from("expenses")
      .select("id,amount,currency,category_id,description,occurred_at,source,deleted_at")
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false }),
    supabase
      .from("expense_items")
      .select("id,expense_id,name,amount,quantity,unit_price,category_id,confidence,created_at")
      .order("created_at"),
  ]);
  const error = [categories, expenses, items].find((result) => result.error)?.error;
  if (error) throw error;

  return {
    categories: (categories.data ?? []).map((row) => categoryFromRow(row as Row)),
    expenses: (expenses.data ?? []).map((row) => expenseFromRow(row as Row)),
    expenseItems: (items.data ?? []).map((row) => itemFromRow(row as Row)),
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

function itemRow(item: ExpenseItem) {
  return {
    id: item.id,
    expense_id: item.expenseId,
    name: item.name,
    amount: item.amount,
    quantity: item.quantity ?? null,
    unit_price: item.unitPrice ?? null,
    category_id: item.categoryId,
    confidence: item.confidence,
  };
}

export async function saveExpense(expense: Expense, items: ExpenseItem[]) {
  const supabase = await client();
  const { error } = await supabase.rpc("save_expense", {
    expense_data: expenseRow(expense),
    item_rows: items.map(itemRow),
  });
  if (error) throw error;
}
