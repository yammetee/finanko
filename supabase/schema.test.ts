import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
const capitalWriterFix = readFileSync(new URL("./migrations/20260808201500_fix_capital_snapshot_rpc.sql", import.meta.url), "utf8");
const capitalPrecisionFix = readFileSync(new URL("./migrations/20260808210000_fix_capital_precision_and_validation.sql", import.meta.url), "utf8");

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
    for (const table of ["capital_groups", "capital_items", "capital_events", "capital_snapshots", "capital_item_quotes"]) {
      expect(schema).toContain(`create table if not exists finanko_private.${table}`);
      expect(schema).toContain(`alter table finanko_private.${table} enable row level security;`);
    }
    expect(schema).toContain("create or replace function public.get_capital_snapshot(expected_owner_id uuid)");
    expect(schema).toContain("create or replace function public.save_capital_snapshot(expected_owner_id uuid, capital_data jsonb)");
    expect(schema).toContain("create or replace function public.save_capital_valuation(expected_owner_id uuid, quote_rows jsonb, value_usd numeric)");
    expect(schema).toContain("create or replace function public.rebuild_capital_history(expected_owner_id uuid, quote_rows jsonb, snapshot_rows jsonb)");
    expect(schema).toContain("'quoteHistory'");
    expect(schema).toContain("capital_item_quotes_latest_idx");
    expect(schema).toContain("security definer\nset search_path = ''");
    expect(schema).toContain("capital_events_external_unique_idx");
    expect(schema).toContain("capital_events_required_values_check");
    expect(schema).not.toContain("unit_price");
    expect(schema).not.toContain("notes text");
    expect(schema).toContain("annual_interest_rate");
    expect(schema).toContain("interest_compounding");
    expect(schema).toContain("external_provider = excluded.external_provider");
    expect(schema).toContain("related_item_id is null or related_item_id <> item_id");
    const capitalSchema = schema.slice(schema.indexOf("create table if not exists finanko_private.capital_groups"));
    expect(capitalSchema).not.toContain("references public.expenses");
    expect(capitalSchema).not.toContain("references public.categories");
    expect(schema).not.toContain("archived_at");
    expect(schema).not.toContain("capital_events drop column deleted_at");
    expect(schema).toContain("create or replace function public.delete_capital_group(expected_owner_id uuid, target_id text)");
    expect(schema).toContain("create or replace function public.delete_capital_item(expected_owner_id uuid, target_id text)");
    expect(schema).toContain("create or replace function public.delete_capital_event(expected_owner_id uuid, target_id text, replacement_rows jsonb)");
    expect(schema).toContain("if replacement_rows is null or jsonb_typeof(replacement_rows) <> 'array'");
    expect(schema).toContain("from jsonb_array_elements(replacement_rows) rows(row)");
    expect(schema).toContain("if coalesce(jsonb_array_length(capital_data->'items'), 0) > 0");
    expect(schema.match(/event_type = case when event_type = 'transfer' then 'withdrawal' else event_type end/g)).toHaveLength(2);
    expect(schema).toContain("where owner_id = requester_id and related_item_id = target_id and item_id <> target_id");
    expect(schema).toContain("and item_id not in (select id from finanko_private.capital_items where owner_id = requester_id and group_id = target_id)");
  });

  it("rejects unauthenticated and cross-owner capital writes", () => {
    expect(schema.match(/if requester_id is null then raise exception 'Authentication required'/g)?.length).toBeGreaterThanOrEqual(3);
    expect(schema.match(/if expected_owner_id is distinct from requester_id then raise exception 'Authentication context changed'/g)).toHaveLength(7);
    expect(schema).toContain("raise exception 'Capital record belongs to another owner'");
    expect(schema).toContain("where g.owner_id <> requester_id");
    expect(schema).toContain("where i.owner_id <> requester_id");
    expect(schema).toContain("where e.owner_id <> requester_id");
    for (const signature of ["get_capital_snapshot(uuid)", "save_capital_snapshot(uuid, jsonb)", "save_capital_valuation(uuid, jsonb, numeric)", "rebuild_capital_history(uuid, jsonb, jsonb)", "delete_capital_group(uuid, text)", "delete_capital_item(uuid, text)", "delete_capital_event(uuid, text, jsonb)"]) {
      expect(schema).toContain(`revoke all on function public.${signature} from public, anon;`);
      expect(schema).toContain(`grant execute on function public.${signature} to authenticated;`);
    }
    for (const legacySignature of ["get_capital_snapshot()", "save_capital_snapshot(jsonb)", "save_capital_valuation(jsonb, numeric)", "rebuild_capital_history(jsonb, jsonb)", "delete_capital_group(text)", "delete_capital_item(text)", "delete_capital_event(text)", "delete_capital_event(uuid, text)"]) {
      expect(schema).toContain(`drop function if exists public.${legacySignature};`);
      expect(capitalPrecisionFix).toContain(`drop function if exists public.${legacySignature};`);
    }
  });

  it("enforces idempotent automatic events at the database boundary", () => {
    expect(schema).toContain("capital_events_external_unique_idx");
    expect(schema).toContain("on finanko_private.capital_events(owner_id, external_provider, external_id)");
    expect(schema).toContain("on conflict (id) do update set item_id = excluded.item_id");
  });

  it("rebuilds the capital writer after removing legacy event columns", () => {
    expect(capitalWriterFix).toContain("create or replace function public.save_capital_snapshot(capital_data jsonb)");
    expect(capitalWriterFix).toContain("insert into finanko_private.capital_groups");
    expect(capitalWriterFix).not.toContain("unit_price");
    expect(capitalWriterFix).not.toContain("notes");
  });

  it("preserves capital decimals as strings and rejects incomplete events", () => {
    expect(schema).toContain("'quantity', e.quantity::text");
    expect(schema).toContain("'price', q.price::text");
    expect(schema).toContain("quantity is not null and quantity > 0");
    expect(schema).toContain("numeric(38,18)");
    expect(capitalPrecisionFix).toContain("create function public.get_capital_snapshot(expected_owner_id uuid)");
    expect(capitalPrecisionFix).toContain("drop column if exists archived_at");
    expect(capitalPrecisionFix).toContain("alter column price type numeric(38,18)");
    expect(capitalPrecisionFix).toContain("delete from finanko_private.capital_snapshots where owner_id in (select owner_id from finanko_private.capital_groups where archived_at is not null)");
    expect(capitalPrecisionFix).not.toContain("create temporary table");
    expect(capitalPrecisionFix).not.toContain("delete from finanko_private.capital_snapshots;\n");
    expect(schema).not.toContain("value_usd is null or value_usd < 0");
    expect(schema).not.toContain("(row->>'total_usd')::numeric < 0");
    expect(schema).toContain("(row->>'price')::numeric < 0");
  });
});
