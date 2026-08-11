begin;

create or replace function public.get_capital_portfolio(expected_owner_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_owner_id is distinct from requester_id then raise exception 'Authentication context changed' using errcode = '42501'; end if;

  return jsonb_build_object(
    'groups', coalesce((select jsonb_agg(to_jsonb(g) - 'owner_id' - 'created_at' - 'updated_at' order by g.created_at) from finanko_private.capital_groups g where g.owner_id = requester_id), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'group_id', i.group_id, 'name', i.name, 'item_type', i.item_type,
      'symbol', i.symbol, 'quote_currency', i.quote_currency, 'manual_price', i.manual_price::text,
      'primary_provider', i.primary_provider, 'primary_asset_id', i.primary_asset_id,
      'fallback_provider', i.fallback_provider, 'fallback_asset_id', i.fallback_asset_id,
      'default_tax_rate', i.default_tax_rate::text, 'annual_interest_rate', i.annual_interest_rate::text,
      'interest_cadence', i.interest_cadence, 'interest_effective_from', i.interest_effective_from,
      'interest_compounding', i.interest_compounding, 'income_destination_item_id', i.income_destination_item_id
    ) order by i.created_at) from finanko_private.capital_items i where i.owner_id = requester_id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'item_id', e.item_id, 'related_item_id', e.related_item_id, 'event_type', e.event_type,
      'status', e.status, 'occurred_at', e.occurred_at, 'quantity', e.quantity::text,
      'amount', e.amount::text, 'fee', e.fee::text, 'tax', e.tax::text, 'currency', e.currency,
      'split_ratio', e.split_ratio::text, 'source', e.source, 'reinvest', e.reinvest,
      'external_provider', e.external_provider, 'external_id', e.external_id
    ) order by e.occurred_at, e.id) from finanko_private.capital_events e where e.owner_id = requester_id), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_capital_portfolio(uuid) from public, anon;
grant execute on function public.get_capital_portfolio(uuid) to authenticated;

create or replace function public.save_capital_records(expected_owner_id uuid, capital_records jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_owner_id is distinct from requester_id then raise exception 'Authentication context changed' using errcode = '42501'; end if;
  if capital_records is null or jsonb_typeof(capital_records) <> 'object' then raise exception 'Invalid capital payload' using errcode = '22023'; end if;
  if exists (
    select 1 from finanko_private.capital_groups g
    join jsonb_array_elements(coalesce(capital_records->'groups', '[]'::jsonb)) rows(row) on g.id = row->>'id'
    where g.owner_id <> requester_id
  ) or exists (
    select 1 from finanko_private.capital_items i
    join jsonb_array_elements(coalesce(capital_records->'items', '[]'::jsonb)) rows(row) on i.id = row->>'id'
    where i.owner_id <> requester_id
  ) or exists (
    select 1 from finanko_private.capital_events e
    join jsonb_array_elements(coalesce(capital_records->'events', '[]'::jsonb)) rows(row) on e.id = row->>'id'
    where e.owner_id <> requester_id
  ) then
    raise exception 'Capital record belongs to another owner' using errcode = '42501';
  end if;

  insert into finanko_private.capital_groups (id, owner_id, name)
  select row->>'id', requester_id, row->>'name'
  from jsonb_array_elements(coalesce(capital_records->'groups', '[]'::jsonb)) rows(row)
  on conflict (id) do update set name = excluded.name, updated_at = now()
  where finanko_private.capital_groups.owner_id = requester_id;

  insert into finanko_private.capital_items (id, owner_id, group_id, name, item_type, symbol, quote_currency, manual_price, primary_provider, primary_asset_id, fallback_provider, fallback_asset_id, default_tax_rate, annual_interest_rate, interest_cadence, interest_effective_from, interest_compounding, income_destination_item_id)
  select row->>'id', requester_id, row->>'group_id', row->>'name', row->>'item_type', nullif(row->>'symbol', ''), row->>'quote_currency', nullif(row->>'manual_price', '')::numeric, nullif(row->>'primary_provider', ''), nullif(row->>'primary_asset_id', ''), nullif(row->>'fallback_provider', ''), nullif(row->>'fallback_asset_id', ''), nullif(row->>'default_tax_rate', '')::numeric, nullif(row->>'annual_interest_rate', '')::numeric, nullif(row->>'interest_cadence', ''), nullif(row->>'interest_effective_from', '')::date, coalesce((row->>'interest_compounding')::boolean, false), nullif(row->>'income_destination_item_id', '')
  from jsonb_array_elements(coalesce(capital_records->'items', '[]'::jsonb)) rows(row)
  on conflict (id) do update set group_id = excluded.group_id, name = excluded.name, item_type = excluded.item_type, symbol = excluded.symbol, quote_currency = excluded.quote_currency, manual_price = excluded.manual_price, primary_provider = excluded.primary_provider, primary_asset_id = excluded.primary_asset_id, fallback_provider = excluded.fallback_provider, fallback_asset_id = excluded.fallback_asset_id, default_tax_rate = excluded.default_tax_rate, annual_interest_rate = excluded.annual_interest_rate, interest_cadence = excluded.interest_cadence, interest_effective_from = excluded.interest_effective_from, interest_compounding = excluded.interest_compounding, income_destination_item_id = excluded.income_destination_item_id, updated_at = now()
  where finanko_private.capital_items.owner_id = requester_id;

  insert into finanko_private.capital_events (id, owner_id, item_id, related_item_id, event_type, status, occurred_at, quantity, amount, fee, tax, currency, split_ratio, source, reinvest, external_provider, external_id)
  select row->>'id', requester_id, row->>'item_id', nullif(row->>'related_item_id', ''), row->>'event_type', row->>'status', (row->>'occurred_at')::timestamptz, nullif(row->>'quantity', '')::numeric, nullif(row->>'amount', '')::numeric, nullif(row->>'fee', '')::numeric, nullif(row->>'tax', '')::numeric, row->>'currency', nullif(row->>'split_ratio', '')::numeric, row->>'source', coalesce((row->>'reinvest')::boolean, false), nullif(row->>'external_provider', ''), nullif(row->>'external_id', '')
  from jsonb_array_elements(coalesce(capital_records->'events', '[]'::jsonb)) rows(row)
  on conflict (id) do update set item_id = excluded.item_id, related_item_id = excluded.related_item_id, event_type = excluded.event_type, status = excluded.status, occurred_at = excluded.occurred_at, quantity = excluded.quantity, amount = excluded.amount, fee = excluded.fee, tax = excluded.tax, currency = excluded.currency, split_ratio = excluded.split_ratio, source = excluded.source, reinvest = excluded.reinvest, external_provider = excluded.external_provider, external_id = excluded.external_id, updated_at = now()
  where finanko_private.capital_events.owner_id = requester_id;
end;
$$;
revoke all on function public.save_capital_records(uuid, jsonb) from public, anon;
grant execute on function public.save_capital_records(uuid, jsonb) to authenticated;

create or replace function public.delete_capital_event(expected_owner_id uuid, target_id text, replacement_rows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_owner_id is distinct from requester_id then raise exception 'Authentication context changed' using errcode = '42501'; end if;
  if replacement_rows is null or jsonb_typeof(replacement_rows) <> 'array' then raise exception 'Invalid replacement events payload' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(replacement_rows) rows(row) where row->>'id' = target_id) then raise exception 'Deleted event cannot be recreated' using errcode = '22023'; end if;
  if exists (select 1 from finanko_private.capital_events where id = target_id and owner_id <> requester_id) then raise exception 'Capital record belongs to another owner' using errcode = '42501'; end if;
  if exists (
    select 1 from finanko_private.capital_events e
    join jsonb_array_elements(replacement_rows) rows(row) on e.id = row->>'id'
    where e.owner_id <> requester_id
  ) then
    raise exception 'Capital record belongs to another owner' using errcode = '42501';
  end if;

  delete from finanko_private.capital_events where id = target_id and owner_id = requester_id;

  insert into finanko_private.capital_events (id, owner_id, item_id, related_item_id, event_type, status, occurred_at, quantity, amount, fee, tax, currency, split_ratio, source, reinvest, external_provider, external_id)
  select row->>'id', requester_id, row->>'item_id', nullif(row->>'related_item_id', ''), row->>'event_type', row->>'status', (row->>'occurred_at')::timestamptz, nullif(row->>'quantity', '')::numeric, nullif(row->>'amount', '')::numeric, nullif(row->>'fee', '')::numeric, nullif(row->>'tax', '')::numeric, row->>'currency', nullif(row->>'split_ratio', '')::numeric, row->>'source', coalesce((row->>'reinvest')::boolean, false), nullif(row->>'external_provider', ''), nullif(row->>'external_id', '')
  from jsonb_array_elements(replacement_rows) rows(row)
  on conflict (id) do update set item_id = excluded.item_id, related_item_id = excluded.related_item_id, event_type = excluded.event_type, status = excluded.status, occurred_at = excluded.occurred_at, quantity = excluded.quantity, amount = excluded.amount, fee = excluded.fee, tax = excluded.tax, currency = excluded.currency, split_ratio = excluded.split_ratio, source = excluded.source, reinvest = excluded.reinvest, external_provider = excluded.external_provider, external_id = excluded.external_id, updated_at = now()
  where finanko_private.capital_events.owner_id = requester_id;
end;
$$;

create or replace function public.delete_capital_item(expected_owner_id uuid, target_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_owner_id is distinct from requester_id then raise exception 'Authentication context changed' using errcode = '42501'; end if;
  update finanko_private.capital_items set income_destination_item_id = null where owner_id = requester_id and income_destination_item_id = target_id;
  update finanko_private.capital_events
  set related_item_id = null,
      event_type = case when event_type = 'transfer' then 'withdrawal' else event_type end,
      updated_at = now()
  where owner_id = requester_id and related_item_id = target_id and item_id <> target_id;
  delete from finanko_private.capital_events where owner_id = requester_id and item_id = target_id;
  delete from finanko_private.capital_items where id = target_id and owner_id = requester_id;
end;
$$;

create or replace function public.delete_capital_group(expected_owner_id uuid, target_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_owner_id is distinct from requester_id then raise exception 'Authentication context changed' using errcode = '42501'; end if;
  update finanko_private.capital_items set income_destination_item_id = null
    where owner_id = requester_id and income_destination_item_id in (select id from finanko_private.capital_items where owner_id = requester_id and group_id = target_id);
  update finanko_private.capital_events
  set related_item_id = null,
      event_type = case when event_type = 'transfer' then 'withdrawal' else event_type end,
      updated_at = now()
  where owner_id = requester_id
    and item_id not in (select id from finanko_private.capital_items where owner_id = requester_id and group_id = target_id)
    and related_item_id in (select id from finanko_private.capital_items where owner_id = requester_id and group_id = target_id);
  delete from finanko_private.capital_events
  where owner_id = requester_id
    and item_id in (select id from finanko_private.capital_items where owner_id = requester_id and group_id = target_id);
  delete from finanko_private.capital_items where owner_id = requester_id and group_id = target_id;
  delete from finanko_private.capital_groups where id = target_id and owner_id = requester_id;
end;
$$;
revoke all on function public.delete_capital_event(uuid, text, jsonb) from public, anon;
grant execute on function public.delete_capital_event(uuid, text, jsonb) to authenticated;
revoke all on function public.delete_capital_item(uuid, text) from public, anon;
grant execute on function public.delete_capital_item(uuid, text) to authenticated;
revoke all on function public.delete_capital_group(uuid, text) from public, anon;
grant execute on function public.delete_capital_group(uuid, text) to authenticated;

create or replace function public.get_financial_summary(expected_owner_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_owner_id is distinct from requester_id then raise exception 'Authentication context changed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'debt_totals', coalesce((
      select jsonb_object_agg(totals.currency, totals.total::text)
      from (
        select debt.currency, sum(coalesce(latest.principal_after, debt.principal_balance)) as total
        from finanko_private.debts debt
        left join lateral (
          select payment.principal_after
          from finanko_private.debt_payments payment
          where payment.owner_id = requester_id and payment.debt_id = debt.id
          order by payment.occurred_at desc, payment.event_sequence desc, payment.id desc
          limit 1
        ) latest on true
        where debt.owner_id = requester_id and coalesce(latest.principal_after, debt.principal_balance) > 0
        group by debt.currency
      ) totals
    ), '{}'::jsonb)
  );
end;
$$;
revoke all on function public.get_financial_summary(uuid) from public, anon;
grant execute on function public.get_financial_summary(uuid) to authenticated;

update finanko_private.capital_items
set fallback_provider = case when item_type = 'crypto' then 'coingecko' else null end,
    fallback_asset_id = case when item_type = 'crypto' then coalesce(
      case when primary_provider = 'coingecko' then primary_asset_id end,
      case when fallback_provider = 'coingecko' then fallback_asset_id end
    ) else null end,
    primary_provider = case when item_type in ('stock', 'fund', 'crypto') then 'tradingview' else null end,
    primary_asset_id = case when item_type in ('stock', 'fund', 'crypto') then symbol else null end,
    updated_at = now();

drop function if exists public.get_capital_snapshot();
drop function if exists public.get_capital_snapshot(uuid);
drop function if exists public.save_capital_snapshot(jsonb);
drop function if exists public.save_capital_snapshot(uuid, jsonb);
drop function if exists public.save_capital_valuation(jsonb, numeric);
drop function if exists public.save_capital_valuation(uuid, jsonb, numeric);
drop function if exists public.save_capital_valuation(uuid, numeric);
drop function if exists public.rebuild_capital_history(jsonb, jsonb);
drop function if exists public.rebuild_capital_history(uuid, jsonb, jsonb);
drop function if exists public.rebuild_capital_history(uuid, jsonb);
drop table if exists finanko_private.capital_snapshots;

notify pgrst, 'reload schema';

commit;
