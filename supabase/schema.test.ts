import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

describe("minimal Finanko schema", () => {
  it("contains only the public expense tables required by the runtime", () => {
    const publicTables = [...schema.matchAll(/create table if not exists public\.([a-z_]+)/g)]
      .map((match) => match[1]);

    expect(publicTables).toEqual(["categories", "expenses"]);
  });

  it("enforces direct owner-scoped RLS on every exposed table", () => {
    for (const table of ["categories", "expenses"]) {
      expect(schema).toContain(`alter table public.${table} enable row level security;`);
      expect(schema).toContain(`create policy owner_access on public.${table}`);
    }
    const exposedPolicies = schema.slice(
      schema.indexOf("drop policy if exists owner_access on public.categories"),
      schema.indexOf("revoke all on all tables in schema public"),
    );
    expect(exposedPolicies.match(/owner_id = \(select auth\.uid\(\)\)/g)).toHaveLength(4);
    expect(schema).toContain("expenses_owner_occurred_active_idx");
    expect(schema).toContain("where deleted_at is null");
  });

  it("saves independent expense batches atomically", () => {
    expect(schema).toContain("create or replace function public.save_expenses(expense_rows jsonb)");
    expect(schema).toContain("security invoker");
    expect(schema).toContain("requester_id uuid := (select auth.uid())");
    expect(schema).toContain("from jsonb_array_elements(expense_rows)");
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

  it("keeps capital data private and independent from expenses", () => {
    for (const table of ["capital_groups", "capital_items", "capital_events", "market_quotes", "market_actions", "capital_snapshots", "capital_item_quotes"]) {
      expect(schema).toContain(`create table if not exists finanko_private.${table}`);
      expect(schema).toContain(`alter table finanko_private.${table} enable row level security;`);
    }
    expect(schema).toContain("create or replace function public.get_capital_snapshot()");
    expect(schema).toContain("create or replace function public.save_capital_snapshot(capital_data jsonb)");
    expect(schema).toContain("create or replace function public.save_capital_valuation(quote_rows jsonb, value_usd numeric)");
    expect(schema).toContain("create or replace function public.rebuild_capital_history(quote_rows jsonb, snapshot_rows jsonb)");
    expect(schema).toContain("'quoteHistory'");
    expect(schema).toContain("capital_item_quotes_latest_idx");
    expect(schema).toContain("security definer\nset search_path = ''");
    expect(schema).toContain("capital_events_external_unique_idx");
    expect(schema).toContain("capital_events_required_values_check");
    expect(schema).toContain("annual_interest_rate");
    expect(schema).toContain("interest_compounding");
    expect(schema).toContain("external_provider = excluded.external_provider");
    expect(schema).toContain("related_item_id is null or related_item_id <> item_id");
    const capitalSchema = schema.slice(schema.indexOf("create table if not exists finanko_private.capital_groups"));
    expect(capitalSchema).not.toContain("references public.expenses");
    expect(capitalSchema).not.toContain("references public.categories");
  });

  it("rejects unauthenticated and cross-owner capital writes", () => {
    expect(schema.match(/if requester_id is null then raise exception 'Authentication required'/g)?.length).toBeGreaterThanOrEqual(3);
    expect(schema).toContain("raise exception 'Capital record belongs to another owner'");
    expect(schema).toContain("where g.owner_id <> requester_id");
    expect(schema).toContain("where i.owner_id <> requester_id");
    expect(schema).toContain("where e.owner_id <> requester_id");
    for (const signature of ["get_capital_snapshot()", "save_capital_snapshot(jsonb)", "save_capital_valuation(jsonb, numeric)", "rebuild_capital_history(jsonb, jsonb)"]) {
      expect(schema).toContain(`revoke all on function public.${signature} from public, anon;`);
      expect(schema).toContain(`grant execute on function public.${signature} to authenticated;`);
    }
  });

  it("enforces idempotent automatic events at the database boundary", () => {
    expect(schema).toContain("capital_events_external_unique_idx");
    expect(schema).toContain("on finanko_private.capital_events(owner_id, external_provider, external_id)");
    expect(schema).toContain("on conflict (id) do update set item_id = excluded.item_id");
  });
});
