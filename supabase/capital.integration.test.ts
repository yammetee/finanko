import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import dayjs from "dayjs";
import { buildCapitalAssetSubmission } from "../src/features/capital/capitalAssetSubmission";
import { deserializeCapitalSnapshot, serializeCapitalSnapshot } from "../src/features/capital/capitalRepository";
import { replayCapitalEvents } from "../src/features/capital/capitalMath";
import { createOpeningPositionRecords } from "../src/features/capital/capitalStore";
import type { CapitalEvent, CapitalGroup, CapitalItem, CapitalSnapshot } from "../src/features/capital/capitalTypes";

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
const cleanupMigration = readFileSync(new URL("./migrations/20260808_capital_permanent_deletion.sql", import.meta.url), "utf8");
const writerMigration = readFileSync(new URL("./migrations/20260808201500_fix_capital_snapshot_rpc.sql", import.meta.url), "utf8");
const precisionMigration = readFileSync(new URL("./migrations/20260808210000_fix_capital_precision_and_validation.sql", import.meta.url), "utf8");

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
    await db.query("insert into auth.users (id) values ($1), ($2)", [USER_A, USER_B]);
    await db.exec(schema);
    await db.exec(cleanupMigration);
    await db.exec(writerMigration);
    await db.exec(`
      alter table finanko_private.capital_groups add column archived_at timestamptz;
      alter table finanko_private.capital_groups add column deleted_at timestamptz;
      alter table finanko_private.capital_items add column archived_at timestamptz;
      alter table finanko_private.capital_items add column deleted_at timestamptz;
      alter table finanko_private.capital_events add column archived_at timestamptz;
      alter table finanko_private.capital_events add column deleted_at timestamptz;
      drop index finanko_private.capital_groups_owner_idx;
      drop index finanko_private.capital_items_owner_group_idx;
      drop index finanko_private.capital_events_owner_item_date_idx;
      drop index finanko_private.capital_events_owner_status_idx;
      drop index finanko_private.capital_events_external_unique_idx;
      create index capital_groups_owner_idx on finanko_private.capital_groups(owner_id) where archived_at is null;
      create index capital_items_owner_group_idx on finanko_private.capital_items(owner_id, group_id) where deleted_at is null;
      create index capital_events_owner_item_date_idx on finanko_private.capital_events(owner_id, item_id, occurred_at, id) where deleted_at is null;
      create index capital_events_owner_status_idx on finanko_private.capital_events(owner_id, status, occurred_at) where deleted_at is null;
      create unique index capital_events_external_unique_idx on finanko_private.capital_events(owner_id, external_provider, external_id) where deleted_at is null and external_provider is not null and external_id is not null;
      insert into finanko_private.capital_groups (id, owner_id, name, archived_at) values ('legacy-group', '${USER_A}', 'Legacy', now());
      insert into finanko_private.capital_items (id, owner_id, group_id, name, item_type, quote_currency) values ('legacy-group-item', '${USER_A}', 'legacy-group', 'Legacy item', 'cash', 'USD');
      insert into finanko_private.capital_groups (id, owner_id, name) values ('legacy-item-container', '${USER_A}', 'Legacy item container');
      insert into finanko_private.capital_items (id, owner_id, group_id, name, item_type, quote_currency, deleted_at) values ('legacy-deleted-item', '${USER_A}', 'legacy-item-container', 'Deleted item', 'cash', 'USD', now());
      insert into finanko_private.capital_groups (id, owner_id, name) values ('legacy-event-container', '${USER_A}', 'Legacy event container');
      insert into finanko_private.capital_items (id, owner_id, group_id, name, item_type, quote_currency) values ('legacy-event-item', '${USER_A}', 'legacy-event-container', 'Event item', 'cash', 'USD');
      insert into finanko_private.capital_events (id, owner_id, item_id, event_type, status, occurred_at, amount, currency, source, archived_at) values ('legacy-event', '${USER_A}', 'legacy-event-item', 'deposit', 'confirmed', now(), 1, 'USD', 'manual', now());
      insert into finanko_private.capital_snapshots (owner_id, snapshot_date, reporting_currency, total_value) values
        ('${USER_A}', '2026-08-01', 'USD', 111),
        ('${USER_B}', '2026-08-01', 'USD', 222);
    `);
    await db.exec(precisionMigration);
    await db.exec("reset role");
  }, 30_000);

  afterAll(async () => {
    await db.close();
  });

  it("executes every capital write and delete RPC against PostgreSQL", async () => {
    await authenticate(USER_A);

    const legacy = await inspect<{ groups: number; items: number; events: number }>(`
      select
        (select count(*)::int from finanko_private.capital_groups where id = 'legacy-group') as groups,
        (select count(*)::int from finanko_private.capital_items where id = 'legacy-deleted-item') as items,
        (select count(*)::int from finanko_private.capital_events where id = 'legacy-event') as events
    `);
    expect(legacy.rows[0]).toEqual({ groups: 0, items: 0, events: 0 });
    const cleanupSnapshots = await inspect<{ owner_id: string; total_value: string }>(`
      select owner_id::text, total_value::text
      from finanko_private.capital_snapshots
      order by owner_id
    `);
    expect(cleanupSnapshots.rows).toEqual([{
      owner_id: USER_B,
      total_value: "222.000000000000000000",
    }]);
    const indexes = await inspect<{ indexdef: string }>("select indexdef from pg_indexes where schemaname = 'finanko_private' and indexname in ('capital_groups_owner_idx', 'capital_items_owner_group_idx', 'capital_items_owner_income_destination_idx', 'capital_events_owner_item_date_idx', 'capital_events_owner_related_item_idx', 'capital_events_owner_status_idx', 'capital_events_external_unique_idx', 'capital_item_quotes_latest_idx') order by indexname");
    expect(indexes.rows).toHaveLength(8);
    expect(indexes.rows.every((row) => !row.indexdef.includes("archived_at") && !row.indexdef.includes("deleted_at"))).toBe(true);
    await inspect("delete from finanko_private.capital_items where id = 'legacy-event-item'");
    await inspect("delete from finanko_private.capital_groups where id in ('legacy-item-container', 'legacy-event-container')");

    const rpcSignatures = await inspect<{
      legacy_get: string | null;
      guarded_get: string | null;
      legacy_save: string | null;
      guarded_save: string | null;
      legacy_delete_event: string | null;
      guarded_delete_event: string | null;
    }>(`
      select
        to_regprocedure('public.get_capital_snapshot()')::text as legacy_get,
        to_regprocedure('public.get_capital_snapshot(uuid)')::text as guarded_get,
        to_regprocedure('public.save_capital_snapshot(jsonb)')::text as legacy_save,
        to_regprocedure('public.save_capital_snapshot(uuid,jsonb)')::text as guarded_save,
        to_regprocedure('public.delete_capital_event(uuid,text)')::text as legacy_delete_event,
        to_regprocedure('public.delete_capital_event(uuid,text,jsonb)')::text as guarded_delete_event
    `);
    expect(rpcSignatures.rows[0]).toEqual({
      legacy_get: null,
      guarded_get: "get_capital_snapshot(uuid)",
      legacy_save: null,
      guarded_save: "save_capital_snapshot(uuid,jsonb)",
      legacy_delete_event: null,
      guarded_delete_event: "delete_capital_event(uuid,text,jsonb)",
    });

    const group: CapitalGroup = { id: "group-main", name: "Portfolio" };
    await rpc("select public.save_capital_valuation($1::uuid, $2::jsonb, $3::numeric)", [USER_A, "[]", "333"]);
    await rpc("select public.save_capital_snapshot($1::uuid, $2::jsonb)", [USER_A, payload({ groups: [group] })]);

    const groupCount = await inspect<CountRow>("select count(*)::int as count from finanko_private.capital_groups where owner_id = auth.uid()");
    expect(groupCount.rows[0].count).toBe(1);
    let snapshotCount = await inspect<CountRow>("select count(*)::int as count from finanko_private.capital_snapshots where owner_id = auth.uid()");
    expect(snapshotCount.rows[0].count).toBe(1);

    const depositSubmission = buildCapitalAssetSubmission({
      type: "deposit", name: "Рубли", currency: "RUB", interestRate: "6",
      interestCadence: "monthly", interestEffectiveFrom: dayjs("2026-08-08"),
      interestCompounding: "yes", openingInvested: "200000", occurredAt: dayjs("2026-08-08"),
    }, { groups: [group] });
    expect(depositSubmission.item.groupId).toBe(group.id);
    const { item: deposit, event: openingDeposit } = createOpeningPositionRecords(
      depositSubmission.item, depositSubmission.openingQuantity ?? "", depositSubmission.openingInvested ?? "",
      `${depositSubmission.occurredAt}T12:00:00.000Z`,
    );
    await rpc("select public.save_capital_snapshot($1::uuid, $2::jsonb)", [USER_A, payload({ items: [deposit], events: [openingDeposit] })]);
    snapshotCount = await inspect<CountRow>("select count(*)::int as count from finanko_private.capital_snapshots where owner_id = auth.uid()");
    expect(snapshotCount.rows[0].count).toBe(0);

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
      where i.id = $1 and i.owner_id = auth.uid()
    `, [deposit.id]);
    expect(savedDeposit.rows[0]).toEqual({
      amount: "200000.000000000000000000",
      annual_interest_rate: "0.060000000000000000",
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
      occurredAt: "2026-08-08T12:00:00.000Z", quantity: "0.00000001", amount: "123456789012345678.123456789012345678",
      currency: "USD", source: "manual",
    };
    await rpc("select public.save_capital_snapshot($1::uuid, $2::jsonb)", [USER_A, payload({ items: [stock], events: [stockBuy] })]);

    await rpc("select public.save_capital_snapshot($1::uuid, $2::jsonb)", [USER_A, payload({
      groups: [{ ...group, name: "Main portfolio" }],
      items: [{ ...deposit, name: "RUB deposit", annualInterestRate: "0.065" }],
      events: [{ ...openingDeposit, amount: "210000" }],
    })]);

    await rpc("select public.save_capital_valuation($1::uuid, $2::jsonb, $3::numeric)", [USER_A, JSON.stringify([{
      item_id: stock.id, provider: "nasdaq", currency: "USD",
      quoted_at: "2026-08-08T18:00:00.000Z", price: "205",
    }]), "-410"]);
    const negativeCurrentValue = await inspect<{ total_value: string }>(`
      select total_value::text
      from finanko_private.capital_snapshots
      where owner_id = '${USER_A}'
    `);
    expect(negativeCurrentValue.rows).toEqual([{ total_value: "-410.000000000000000000" }]);

    await expect(rpc("select public.save_capital_valuation($1::uuid, $2::jsonb, $3::numeric)", [USER_A, JSON.stringify([{
      item_id: stock.id, provider: "nasdaq", currency: "USD",
      quoted_at: "2026-08-08T19:00:00.000Z", price: "-1",
    }]), "-410"])).rejects.toThrow(/Invalid valuation payload/);
    await expect(rpc("select public.save_capital_valuation($1::uuid, $2::jsonb, $3::numeric)", [USER_A, "[]", null])).rejects.toThrow(/Invalid valuation payload/);

    await rpc("select public.rebuild_capital_history($1::uuid, $2::jsonb, $3::jsonb)", [USER_A, JSON.stringify([{
      item_id: stock.id, provider: "nasdaq", currency: "USD",
      quoted_at: "2026-08-07T18:00:00.000Z", price: "198",
    }]), JSON.stringify([
      { date: "2026-08-07", total_usd: "-405.123456789012345678" },
      { date: "2026-08-08", total_usd: "-410" },
    ])]);

    const snapshotResult = await rpc<SnapshotRow>("select public.get_capital_snapshot($1::uuid) as snapshot", [USER_A]);
    const snapshot = snapshotResult.rows[0].snapshot!;
    expect(snapshot.groups).toEqual([expect.objectContaining({ id: "group-main", name: "Main portfolio" })]);
    expect(snapshot.items).toHaveLength(2);
    expect(snapshot.events).toHaveLength(2);
    expect(snapshot.quotes).toEqual([expect.objectContaining({ item_id: "item-aapl", price: "205.000000000000000000" })]);
    expect(snapshot.quoteHistory).toHaveLength(2);
    expect(snapshot.snapshots).toEqual([
      expect.objectContaining({ snapshot_date: "2026-08-07", total_value: "-405.123456789012345678" }),
      expect.objectContaining({ snapshot_date: "2026-08-08", total_value: "-410.000000000000000000" }),
    ]);
    const loaded = deserializeCapitalSnapshot(snapshot);
    expect(loaded.events.find((value) => value.id === stockBuy.id)).toEqual(expect.objectContaining({
      quantity: "0.000000010000000000",
      amount: "123456789012345678.123456789012345678",
      occurredAt: "2026-08-08T12:00:00.000Z",
    }));
    expect(loaded.latestQuotes?.[0].quotedAt).toBe("2026-08-08T18:00:00.000Z");
    expect(() => replayCapitalEvents(stock.id, loaded.events)).not.toThrow();

    await expect(rpc("select public.save_capital_snapshot($1::uuid, $2::jsonb)", [USER_A, JSON.stringify({
      groups: [], items: [], events: [{
        id: "invalid-buy", item_id: stock.id, related_item_id: null, event_type: "buy", status: "confirmed",
        occurred_at: "2026-08-08T12:00:00.000Z", quantity: null, amount: "10", fee: null, tax: null,
        currency: "USD", split_ratio: null, source: "manual", reinvest: false, external_provider: null, external_id: null,
      }],
    })])).rejects.toThrow(/capital_events_required_values_check/);

    await authenticate(USER_B);
    await expect(rpc("select public.get_capital_snapshot($1::uuid)", [USER_A])).rejects.toThrow(/Authentication context changed/);
    await expect(rpc("select public.save_capital_snapshot($1::uuid, $2::jsonb)", [USER_A, payload({})])).rejects.toThrow(/Authentication context changed/);
    await expect(rpc("select public.save_capital_valuation($1::uuid, $2::jsonb, $3::numeric)", [USER_A, "[]", "1"])).rejects.toThrow(/Authentication context changed/);
    await expect(rpc("select public.rebuild_capital_history($1::uuid, $2::jsonb, $3::jsonb)", [USER_A, "[]", "[]"])).rejects.toThrow(/Authentication context changed/);
    await expect(rpc("select public.delete_capital_event($1::uuid, $2, $3::jsonb)", [USER_A, stockBuy.id, "[]"])).rejects.toThrow(/Authentication context changed/);
    await expect(rpc("select public.delete_capital_event($1::uuid, $2, $3::jsonb)", [USER_B, stockBuy.id, "[]"])).rejects.toThrow(/another owner/);
    await expect(rpc("select public.delete_capital_item($1::uuid, $2)", [USER_A, stock.id])).rejects.toThrow(/Authentication context changed/);
    await expect(rpc("select public.delete_capital_group($1::uuid, $2)", [USER_A, group.id])).rejects.toThrow(/Authentication context changed/);

    await expect(rpc("select public.save_capital_snapshot($1::uuid, $2::jsonb)", [USER_B, payload({
      groups: [{ id: group.id, name: "Stolen" }],
    })])).rejects.toThrow(/another owner/);
    const isolatedSnapshot = await rpc<SnapshotRow>("select public.get_capital_snapshot($1::uuid) as snapshot", [USER_B]);
    expect(isolatedSnapshot.rows[0].snapshot?.groups).toEqual([]);

    await authenticate(USER_A);
    await rpc("select public.save_capital_snapshot($1::uuid, $2::jsonb)", [USER_A, payload({
      events: [{ ...stockBuy, relatedItemId: deposit.id }],
    })]);
    await rpc("select public.delete_capital_item($1::uuid, $2)", [USER_A, deposit.id]);
    const linkedBuyAfterCashDelete = await inspect<{ event_type: string; related_item_id: string | null }>(`
      select event_type, related_item_id
      from finanko_private.capital_events
      where owner_id = '${USER_A}' and id = '${stockBuy.id}'
    `);
    expect(linkedBuyAfterCashDelete.rows).toEqual([{ event_type: "buy", related_item_id: null }]);
    let count = await inspect<CountRow>("select count(*)::int as count from finanko_private.capital_events where id = $1", [openingDeposit.id]);
    expect(count.rows[0].count).toBe(0);

    const sourceCash: CapitalItem = {
      id: "item-source-cash", groupId: group.id, name: "Source cash", type: "cash",
      quoteCurrency: "USD", manualPrice: "1",
    };
    const destinationCash: CapitalItem = {
      id: "item-destination-cash", groupId: group.id, name: "Destination cash", type: "cash",
      quoteCurrency: "USD", manualPrice: "1",
    };
    const destinationTransfer: CapitalEvent = {
      id: "event-transfer-to-deleted-item", itemId: sourceCash.id, relatedItemId: destinationCash.id,
      type: "transfer", status: "confirmed", occurredAt: "2026-08-08T13:00:00.000Z",
      quantity: "20.125", amount: "20.125", currency: "USD", source: "manual",
    };
    await rpc("select public.save_capital_snapshot($1::uuid, $2::jsonb)", [USER_A, payload({
      items: [sourceCash, destinationCash], events: [destinationTransfer],
    })]);
    await rpc("select public.delete_capital_item($1::uuid, $2)", [USER_A, destinationCash.id]);
    const transferAfterDestinationDelete = await inspect<{
      event_type: string;
      related_item_id: string | null;
      quantity: string;
      amount: string;
    }>(`
      select event_type, related_item_id, quantity::text, amount::text
      from finanko_private.capital_events
      where owner_id = '${USER_A}' and id = '${destinationTransfer.id}'
    `);
    expect(transferAfterDestinationDelete.rows).toEqual([{
      event_type: "withdrawal",
      related_item_id: null,
      quantity: "20.125000000000000000",
      amount: "20.125000000000000000",
    }]);

    const linkedGroup: CapitalGroup = { id: "group-linked-delete", name: "Linked group" };
    const linkedGroupCash: CapitalItem = {
      id: "item-linked-group-cash", groupId: linkedGroup.id, name: "Linked cash", type: "cash",
      quoteCurrency: "USD", manualPrice: "1",
    };
    const linkedGroupSource: CapitalItem = {
      id: "item-linked-group-source", groupId: linkedGroup.id, name: "Linked source", type: "cash",
      quoteCurrency: "USD", manualPrice: "1",
    };
    const linkedGroupBuy: CapitalEvent = {
      id: "event-buy-linked-group", itemId: stock.id, relatedItemId: linkedGroupCash.id,
      type: "buy", status: "confirmed", occurredAt: "2026-08-08T14:00:00.000Z",
      quantity: "0.125", amount: "25", currency: "USD", source: "manual",
    };
    const transferIntoLinkedGroup: CapitalEvent = {
      id: "event-transfer-into-linked-group", itemId: sourceCash.id, relatedItemId: linkedGroupCash.id,
      type: "transfer", status: "confirmed", occurredAt: "2026-08-08T15:00:00.000Z",
      quantity: "12", amount: "12", currency: "USD", source: "manual",
    };
    const transferOutOfLinkedGroup: CapitalEvent = {
      id: "event-transfer-out-of-linked-group", itemId: linkedGroupSource.id, relatedItemId: sourceCash.id,
      type: "transfer", status: "confirmed", occurredAt: "2026-08-08T16:00:00.000Z",
      quantity: "7", amount: "7", currency: "USD", source: "manual",
    };
    await rpc("select public.save_capital_snapshot($1::uuid, $2::jsonb)", [USER_A, payload({
      groups: [linkedGroup],
      items: [linkedGroupCash, linkedGroupSource],
      events: [linkedGroupBuy, transferIntoLinkedGroup, transferOutOfLinkedGroup],
    })]);
    await rpc("select public.delete_capital_group($1::uuid, $2)", [USER_A, linkedGroup.id]);
    const survivingLinkedEvents = await inspect<{
      id: string;
      event_type: string;
      related_item_id: string | null;
      quantity: string;
      amount: string;
    }>(`
      select id, event_type, related_item_id, quantity::text, amount::text
      from finanko_private.capital_events
      where owner_id = '${USER_A}'
        and id in ('${linkedGroupBuy.id}', '${transferIntoLinkedGroup.id}', '${transferOutOfLinkedGroup.id}')
      order by id
    `);
    expect(survivingLinkedEvents.rows).toEqual([
      {
        id: linkedGroupBuy.id,
        event_type: "buy",
        related_item_id: null,
        quantity: "0.125000000000000000",
        amount: "25.000000000000000000",
      },
      {
        id: transferIntoLinkedGroup.id,
        event_type: "withdrawal",
        related_item_id: null,
        quantity: "12.000000000000000000",
        amount: "12.000000000000000000",
      },
    ]);
    count = await inspect<CountRow>("select count(*)::int as count from finanko_private.capital_items where group_id = $1", [linkedGroup.id]);
    expect(count.rows[0].count).toBe(0);

    await rpc("select public.save_capital_valuation($1::uuid, $2::jsonb, $3::numeric)", [USER_A, "[]", "77"]);
    const invalidReplacement = {
      ...destinationTransfer,
      type: "withdrawal" as const,
      relatedItemId: undefined,
      quantity: undefined,
      amount: undefined,
    };
    await expect(rpc("select public.delete_capital_event($1::uuid, $2, $3::jsonb)", [
      USER_A,
      stockBuy.id,
      JSON.stringify(serializeCapitalSnapshot({ events: [invalidReplacement] }).events),
    ])).rejects.toThrow(/capital_events_required_values_check/);
    count = await inspect<CountRow>("select count(*)::int as count from finanko_private.capital_events where id = $1", [stockBuy.id]);
    expect(count.rows[0].count).toBe(1);
    snapshotCount = await inspect<CountRow>("select count(*)::int as count from finanko_private.capital_snapshots where owner_id = auth.uid()");
    expect(snapshotCount.rows[0].count).toBe(1);

    const recalculatedTransfer: CapitalEvent = {
      ...destinationTransfer,
      type: "withdrawal",
      relatedItemId: undefined,
      quantity: "19.5",
      amount: "19.5",
    };
    await rpc("select public.delete_capital_event($1::uuid, $2, $3::jsonb)", [
      USER_A,
      stockBuy.id,
      JSON.stringify(serializeCapitalSnapshot({ events: [recalculatedTransfer] }).events),
    ]);
    count = await inspect<CountRow>("select count(*)::int as count from finanko_private.capital_events where id = $1", [stockBuy.id]);
    expect(count.rows[0].count).toBe(0);
    const recalculatedTransferRow = await inspect<{ event_type: string; quantity: string; amount: string }>(`
      select event_type, quantity::text, amount::text
      from finanko_private.capital_events
      where id = '${destinationTransfer.id}' and owner_id = '${USER_A}'
    `);
    expect(recalculatedTransferRow.rows).toEqual([{
      event_type: "withdrawal",
      quantity: "19.500000000000000000",
      amount: "19.500000000000000000",
    }]);
    snapshotCount = await inspect<CountRow>("select count(*)::int as count from finanko_private.capital_snapshots where owner_id = auth.uid()");
    expect(snapshotCount.rows[0].count).toBe(0);

    await rpc("select public.delete_capital_item($1::uuid, $2)", [USER_A, stock.id]);
    count = await inspect<CountRow>("select count(*)::int as count from finanko_private.capital_items where id = $1", [stock.id]);
    expect(count.rows[0].count).toBe(0);
    count = await inspect<CountRow>("select count(*)::int as count from finanko_private.capital_item_quotes where item_id = $1", [stock.id]);
    expect(count.rows[0].count).toBe(0);

    await rpc("select public.delete_capital_group($1::uuid, $2)", [USER_A, "group-main"]);
    const remaining = await inspect<{ groups: number; items: number; events: number }>(`
      select
        (select count(*)::int from finanko_private.capital_groups where owner_id = auth.uid()) as groups,
        (select count(*)::int from finanko_private.capital_items where owner_id = auth.uid()) as items,
        (select count(*)::int from finanko_private.capital_events where owner_id = auth.uid()) as events
    `);
    expect(remaining.rows[0]).toEqual({ groups: 0, items: 0, events: 0 });

    await authenticate();
    await expect(rpc("select public.save_capital_snapshot($1::uuid, $2::jsonb)", [USER_A, payload({})])).rejects.toThrow(/Authentication required/);
    await expect(rpc("select public.get_capital_snapshot($1::uuid)", [USER_A])).rejects.toThrow(/Authentication required/);
  }, 30_000);
});
