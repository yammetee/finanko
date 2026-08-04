import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
const baseline = readFileSync(new URL("./expense-baseline.sql", import.meta.url), "utf8");

describe("expense data safety", () => {
  it("keeps owner-scoped RLS enabled on every exposed financial table", () => {
    for (const table of [
      "portfolios",
      "accounts",
      "categories",
      "recurring_rules",
      "transactions",
      "transaction_items",
    ]) {
      expect(schema).toContain(`alter table public.${table} enable row level security;`);
    }
    expect(schema).toContain("create policy portfolios_owner on public.portfolios");
    expect(schema).toContain("create policy owner_access on public.transaction_items");
    expect(schema).toContain("public.owns_portfolio(t.portfolio_id)");
  });

  it("keeps the baseline script strictly read-only", () => {
    const executableSql = baseline.replace(/^--.*$/gm, "");
    expect(executableSql).not.toMatch(/\b(insert|update|delete|truncate|drop|alter|create)\b/i);
    expect(executableSql).toContain("where t.type = 'expense'");
    expect(executableSql).toContain("and t.deleted_at is null");
  });

  it("retains legacy tables and adds an expense-period index without destructive DDL", () => {
    expect(schema).toContain("create table if not exists public.portfolios");
    expect(schema).toContain("create table if not exists public.accounts");
    expect(schema).toContain("transactions_active_expense_period_idx");
    expect(schema).not.toMatch(/\b(drop table|truncate table)\b/i);
  });
});
