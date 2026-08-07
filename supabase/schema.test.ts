import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
const reset = readFileSync(new URL("./reset-public-schema.sql", import.meta.url), "utf8");
const itemMigration = readFileSync(new URL("./migrate-expense-items-to-expenses.sql", import.meta.url), "utf8");

function executableSql(value: string) {
  return value.replace(/^--.*$/gm, "");
}

describe("minimal Finanko schema", () => {
  it("contains only the public expense tables required by the runtime", () => {
    const publicTables = [...schema.matchAll(/create table if not exists public\.([a-z_]+)/g)]
      .map((match) => match[1]);

    expect(publicTables).toEqual(["categories", "expenses"]);
    expect(schema).not.toMatch(/public\.(portfolios|accounts|transactions|recurring_rules)/);
    expect(schema).not.toMatch(/\b(income|debt|interest|mortgage|loan)\b/i);
  });

  it("enforces direct owner-scoped RLS on every exposed table", () => {
    for (const table of ["categories", "expenses"]) {
      expect(schema).toContain(`alter table public.${table} enable row level security;`);
      expect(schema).toContain(`create policy owner_access on public.${table}`);
    }
    expect(schema.match(/owner_id = \(select auth\.uid\(\)\)/g)).toHaveLength(4);
    expect(schema).toContain("expenses_owner_occurred_active_idx");
    expect(schema).toContain("where deleted_at is null");
  });

  it("saves independent expense batches atomically without line-item compatibility", () => {
    expect(schema).toContain("create or replace function public.save_expenses(expense_rows jsonb)");
    expect(schema).toContain("security invoker");
    expect(schema).toContain("requester_id uuid := (select auth.uid())");
    expect(schema).toContain("from jsonb_array_elements(expense_rows)");
    expect(schema).not.toContain("create table if not exists public.expense_items");
    expect(schema).not.toMatch(/linked_account|principal_amount|interest_amount|recurring_rule/);
  });

  it("keeps AI roles and usage private behind the atomic authenticated RPC", () => {
    for (const table of ["user_roles", "ai_usage_daily"]) {
      expect(schema).toContain(`create table if not exists finanko_private.${table}`);
      expect(schema).toContain(`alter table finanko_private.${table} enable row level security;`);
    }
    expect(schema).toContain("primary key (user_id, usage_date)");
    expect(schema).toContain("check (request_count between 0 and 5)");
    expect(schema).toContain("security definer\nset search_path = ''");
    expect(schema).toContain("where usage.request_count < 5");
    expect(schema).toContain("revoke all on all tables in schema finanko_private from public, anon, authenticated");
    expect(schema).toContain("revoke all on function public.consume_ai_daily_quota() from public, anon");
    expect(schema).toContain("grant execute on function public.consume_ai_daily_quota() to authenticated");
  });

  it("promotes legacy item rows before removing parent/item persistence", () => {
    expect(itemMigration).toContain("insert into public.expenses");
    expect(itemMigration).toContain("from public.expense_items as item");
    expect(itemMigration).toContain("delete from public.expenses as parent");
    expect(itemMigration).toContain("drop table public.expense_items");
    expect(itemMigration.indexOf("insert into public.expenses"))
      .toBeLessThan(itemMigration.indexOf("drop table public.expense_items"));
  });

  it("limits the destructive reset to public app objects and the Finanko private schema", () => {
    const sql = executableSql(reset);
    expect(sql).toContain("drop schema if exists finanko_private cascade");
    expect(sql).not.toMatch(/drop schema(?: if exists)? public/i);
    for (const managedSchema of [
      "auth",
      "storage",
      "extensions",
      "realtime",
      "vault",
      "graphql",
      "graphql_public",
      "supabase_functions",
      "supabase_migrations",
    ]) {
      expect(sql).not.toMatch(new RegExp(`drop\\s+(?:table|schema|function|procedure|type).*${managedSchema}\\.`, "i"));
    }
    expect(sql).toContain("namespace.nspname = 'public'");
    expect(sql).toContain("dependency.deptype = 'e'");
  });
});
