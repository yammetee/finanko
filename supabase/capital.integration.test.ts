import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serializeCapitalSnapshot } from "../src/features/capital/capitalRepository";
import type { CapitalEvent, CapitalGroup, CapitalItem, CapitalSnapshot } from "../src/features/capital/capitalTypes";

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
const cleanupMigration = readFileSync(new URL("./migrations/20260808_capital_permanent_deletion.sql", import.meta.url), "utf8");
const writerMigration = readFileSync(new URL("./migrations/20260808201500_fix_capital_snapshot_rpc.sql", import.meta.url), "utf8");

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

type CountRow = { count: number };
type SnapshotRow = { snapshot: Record<string, Record<string, unknown>[]> | null };

describe("capital PostgreSQL RPC integration", () => {
  let db: PGlite;

  const authenticate = async (userId?: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  };

  const rpc = async <T,>(sql: string, params: unknown[] = []) => {
    await db.exec("reset role; set role authenticated");
    return db.query<T>(sql, params);
  };

  const inspect = async <T,>(sql: string, params: unknown[] = []) => {
    await db.exec("reset role");
    return db.query<T>(sql, params);
  };

  const payload = (snapshot: Partial<CapitalSnapshot>) => JSON.stringify(serializeCapitalSnapshot(snapshot));

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users (id uuid primary key);
      create or replace function auth.uid()
      returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
    `);
    await db.exec(schema);
    await db.exec(cleanupMigration);
    await db.exec(writerMigration);
    await db.exec("reset role");
    await db.query("insert into auth.users (id) values ($1), ($2)", [USER_A, USER_B]);
  }, 30_000);

  afterAll(async () => {
    await db.close();
  });

  it("executes every capital write and delete RPC against PostgreSQL", async () => {
    await authenticate(USER_A);

    const group: CapitalGroup = { id: "group-main", name: "Portfolio" };
    await rpc("select public.save_capital_snapshot($1::jsonb)", [payload({ groups: [group] })]);

    const groupCount = await inspect<CountRow>("select count(*)::int as count from finanko_private.capital_groups where owner_id = auth.uid()");
    expect(groupCount.rows[0].count).toBe(1);

    const deposit: CapitalItem = {
      id: "item-rub-deposit", groupId: group.id, name: "Рубли", type: "deposit",
      quoteCurrency: "RUB", manualPrice: "1", annualInterestRate: "0.06",
      interestCadence: "monthly", interestEffectiveFrom: "2026-08-08", interestCompounding: true,
    };
    const openingDeposit: CapitalEvent = {
      id: "event-rub-opening", itemId: deposit.id, type: "deposit", status: "confirmed",
      occurredAt: "2026-08-08T12:00:00.000Z", amount: "200000", currency: "RUB", source: "manual",
    };
    await rpc("select public.save_capital_snapshot($1::jsonb)", [payload({ items: [deposit], events: [openingDeposit] })]);

    const savedDeposit = await inspect<{
      amount: string;
      annual_interest_rate: string;
      interest_compounding: boolean;
      interest_cadence: string;
      quote_currency: string;
    }>(`
      select e.amount::text, i.annual_interest_rate::text, i.interest_compounding,
             i.interest_cadence, i.quote_currency
      from finanko_private.capital_items i
      join finanko_private.capital_events e on e.item_id = i.id and e.owner_id = i.owner_id
      where i.id = 'item-rub-deposit' and i.owner_id = auth.uid()
    `);
    expect(savedDeposit.rows[0]).toEqual({
      amount: "200000.0000000000",
      annual_interest_rate: "0.060000000",
      interest_compounding: true,
      interest_cadence: "monthly",
      quote_currency: "RUB",
    });

    const stock: CapitalItem = {
      id: "item-aapl", groupId: group.id, name: "Apple", type: "stock", symbol: "AAPL",
      quoteCurrency: "USD", manualPrice: "200", primaryProvider: "nasdaq",
      primaryAssetId: "AAPL", fallbackProvider: "yahoo", fallbackAssetId: "AAPL",
    };
    const stockBuy: CapitalEvent = {
      id: "event-aapl-buy", itemId: stock.id, type: "buy", status: "confirmed",
      occurredAt: "2026-08-08T12:00:00.000Z", quantity: "2", amount: "400",
      currency: "USD", source: "manual",
    };
    await rpc("select public.save_capital_snapshot($1::jsonb)", [payload({ items: [stock], events: [stockBuy] })]);

    await rpc("select public.save_capital_snapshot($1::jsonb)", [payload({
      groups: [{ ...group, name: "Main portfolio" }],
      items: [{ ...deposit, name: "RUB deposit", annualInterestRate: "0.065" }],
      events: [{ ...openingDeposit, amount: "210000" }],
    })]);

    await rpc("select public.save_capital_valuation($1::jsonb, $2::numeric)", [JSON.stringify([{
      item_id: stock.id, provider: "nasdaq", currency: "USD",
      quoted_at: "2026-08-08T18:00:00.000Z", price: "205",
    }]), "410"]);

    await rpc("select public.rebuild_capital_history($1::jsonb, $2::jsonb)", [JSON.stringify([{
      item_id: stock.id, provider: "nasdaq", currency: "USD",
      quoted_at: "2026-08-07T18:00:00.000Z", price: "198",
    }]), JSON.stringify([
      { date: "2026-08-07", total_usd: "405" },
      { date: "2026-08-08", total_usd: "410" },
    ])]);

    const snapshotResult = await rpc<SnapshotRow>("select public.get_capital_snapshot() as snapshot");
    const snapshot = snapshotResult.rows[0].snapshot!;
    expect(snapshot.groups).toEqual([expect.objectContaining({ id: "group-main", name: "Main portfolio" })]);
    expect(snapshot.items).toHaveLength(2);
    expect(snapshot.events).toHaveLength(2);
    expect(snapshot.quotes).toEqual([expect.objectContaining({ item_id: "item-aapl", price: 205 })]);
    expect(snapshot.quoteHistory).toHaveLength(2);
    expect(snapshot.snapshots).toHaveLength(2);

    await authenticate(USER_B);
    await expect(rpc("select public.save_capital_snapshot($1::jsonb)", [payload({
      groups: [{ id: group.id, name: "Stolen" }],
    })])).rejects.toThrow(/another owner/);
    const isolatedSnapshot = await rpc<SnapshotRow>("select public.get_capital_snapshot() as snapshot");
    expect(isolatedSnapshot.rows[0].snapshot?.groups).toEqual([]);

    await authenticate(USER_A);
    await rpc("select public.delete_capital_event($1)", [stockBuy.id]);
    let count = await inspect<CountRow>("select count(*)::int as count from finanko_private.capital_events where id = $1", [stockBuy.id]);
    expect(count.rows[0].count).toBe(0);

    await rpc("select public.delete_capital_item($1)", [stock.id]);
    count = await inspect<CountRow>("select count(*)::int as count from finanko_private.capital_items where id = $1", [stock.id]);
    expect(count.rows[0].count).toBe(0);
    count = await inspect<CountRow>("select count(*)::int as count from finanko_private.capital_item_quotes where item_id = $1", [stock.id]);
    expect(count.rows[0].count).toBe(0);

    await rpc("select public.delete_capital_group($1)", ["group-main"]);
    const remaining = await inspect<{ groups: number; items: number; events: number }>(`
      select
        (select count(*)::int from finanko_private.capital_groups where owner_id = auth.uid()) as groups,
        (select count(*)::int from finanko_private.capital_items where owner_id = auth.uid()) as items,
        (select count(*)::int from finanko_private.capital_events where owner_id = auth.uid()) as events
    `);
    expect(remaining.rows[0]).toEqual({ groups: 0, items: 0, events: 0 });

    await authenticate();
    await expect(rpc("select public.save_capital_snapshot($1::jsonb)", [payload({})])).rejects.toThrow(/Authentication required/);
    const anonymousSnapshot = await rpc<SnapshotRow>("select public.get_capital_snapshot() as snapshot");
    expect(anonymousSnapshot.rows[0].snapshot).toBeNull();
  }, 30_000);
});
