-- Preserve decimal strings across PostgREST, enforce event values, and finish capital legacy cleanup.

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'finanko_private' and table_name = 'capital_groups' and column_name = 'archived_at') then
    execute 'delete from finanko_private.capital_snapshots where owner_id in (select owner_id from finanko_private.capital_groups where archived_at is not null)';
    execute 'update finanko_private.capital_items set income_destination_item_id = null where income_destination_item_id in (select i.id from finanko_private.capital_items i join finanko_private.capital_groups g on g.id = i.group_id and g.owner_id = i.owner_id where g.archived_at is not null)';
    execute 'delete from finanko_private.capital_events e where exists (select 1 from finanko_private.capital_items i join finanko_private.capital_groups g on g.id = i.group_id and g.owner_id = i.owner_id where g.archived_at is not null and i.owner_id = e.owner_id and (i.id = e.item_id or i.id = e.related_item_id))';
    execute 'delete from finanko_private.capital_items i where exists (select 1 from finanko_private.capital_groups g where g.id = i.group_id and g.owner_id = i.owner_id and g.archived_at is not null)';
    execute 'delete from finanko_private.capital_groups where archived_at is not null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'finanko_private' and table_name = 'capital_groups' and column_name = 'deleted_at') then
    execute 'delete from finanko_private.capital_snapshots where owner_id in (select owner_id from finanko_private.capital_groups where deleted_at is not null)';
    execute 'update finanko_private.capital_items set income_destination_item_id = null where income_destination_item_id in (select i.id from finanko_private.capital_items i join finanko_private.capital_groups g on g.id = i.group_id and g.owner_id = i.owner_id where g.deleted_at is not null)';
    execute 'delete from finanko_private.capital_events e where exists (select 1 from finanko_private.capital_items i join finanko_private.capital_groups g on g.id = i.group_id and g.owner_id = i.owner_id where g.deleted_at is not null and i.owner_id = e.owner_id and (i.id = e.item_id or i.id = e.related_item_id))';
    execute 'delete from finanko_private.capital_items i where exists (select 1 from finanko_private.capital_groups g where g.id = i.group_id and g.owner_id = i.owner_id and g.deleted_at is not null)';
    execute 'delete from finanko_private.capital_groups where deleted_at is not null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'finanko_private' and table_name = 'capital_items' and column_name = 'archived_at') then
    execute 'delete from finanko_private.capital_snapshots where owner_id in (select owner_id from finanko_private.capital_items where archived_at is not null)';
    execute 'update finanko_private.capital_items set income_destination_item_id = null where income_destination_item_id in (select id from finanko_private.capital_items where archived_at is not null)';
    execute 'delete from finanko_private.capital_events e where exists (select 1 from finanko_private.capital_items i where i.archived_at is not null and i.owner_id = e.owner_id and (i.id = e.item_id or i.id = e.related_item_id))';
    execute 'delete from finanko_private.capital_items where archived_at is not null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'finanko_private' and table_name = 'capital_items' and column_name = 'deleted_at') then
    execute 'delete from finanko_private.capital_snapshots where owner_id in (select owner_id from finanko_private.capital_items where deleted_at is not null)';
    execute 'update finanko_private.capital_items set income_destination_item_id = null where income_destination_item_id in (select id from finanko_private.capital_items where deleted_at is not null)';
    execute 'delete from finanko_private.capital_events e where exists (select 1 from finanko_private.capital_items i where i.deleted_at is not null and i.owner_id = e.owner_id and (i.id = e.item_id or i.id = e.related_item_id))';
    execute 'delete from finanko_private.capital_items where deleted_at is not null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'finanko_private' and table_name = 'capital_events' and column_name = 'archived_at') then
    execute 'delete from finanko_private.capital_snapshots where owner_id in (select owner_id from finanko_private.capital_events where archived_at is not null)';
    execute 'delete from finanko_private.capital_events where archived_at is not null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'finanko_private' and table_name = 'capital_events' and column_name = 'deleted_at') then
    execute 'delete from finanko_private.capital_snapshots where owner_id in (select owner_id from finanko_private.capital_events where deleted_at is not null)';
    execute 'delete from finanko_private.capital_events where deleted_at is not null';
  end if;
end $$;

alter table finanko_private.capital_groups drop column if exists archived_at;
alter table finanko_private.capital_groups drop column if exists deleted_at;
alter table finanko_private.capital_items drop column if exists archived_at;
alter table finanko_private.capital_items drop column if exists deleted_at;
alter table finanko_private.capital_events drop column if exists archived_at;
alter table finanko_private.capital_events drop column if exists deleted_at;

alter table finanko_private.capital_items alter column manual_price type numeric(38,18) using manual_price::numeric(38,18);
alter table finanko_private.capital_items alter column default_tax_rate type numeric(38,18) using default_tax_rate::numeric(38,18);
alter table finanko_private.capital_items alter column annual_interest_rate type numeric(38,18) using annual_interest_rate::numeric(38,18);
alter table finanko_private.capital_events alter column amount type numeric(38,18) using amount::numeric(38,18);
alter table finanko_private.capital_events alter column fee type numeric(38,18) using fee::numeric(38,18);
alter table finanko_private.capital_events alter column tax type numeric(38,18) using tax::numeric(38,18);
alter table finanko_private.capital_events alter column split_ratio type numeric(38,18) using split_ratio::numeric(38,18);
alter table finanko_private.capital_snapshots alter column total_value type numeric(38,18) using total_value::numeric(38,18);
alter table finanko_private.capital_item_quotes alter column price type numeric(38,18) using price::numeric(38,18);

alter table finanko_private.capital_events drop constraint if exists capital_events_required_values_check;
alter table finanko_private.capital_events add constraint capital_events_required_values_check check (
  (event_type in ('buy', 'sell', 'staking') and quantity is not null and quantity > 0 and amount is not null and amount > 0)
  or (event_type in ('deposit', 'withdrawal', 'transfer') and ((quantity is not null and quantity > 0) or (amount is not null and amount > 0)))
  or (event_type in ('dividend', 'interest', 'fee', 'tax') and amount is not null and amount > 0)
  or (event_type = 'split' and split_ratio is not null and split_ratio > 0)
  or (event_type = 'adjustment' and ((quantity is not null and quantity <> 0) or (amount is not null and amount <> 0)))
);

drop index if exists finanko_private.capital_groups_owner_idx;
drop index if exists finanko_private.capital_items_owner_group_idx;
drop index if exists finanko_private.capital_items_owner_income_destination_idx;
drop index if exists finanko_private.capital_events_owner_item_date_idx;
drop index if exists finanko_private.capital_events_owner_related_item_idx;
drop index if exists finanko_private.capital_events_owner_status_idx;
drop index if exists finanko_private.capital_events_external_unique_idx;
drop index if exists finanko_private.capital_item_quotes_latest_idx;
create index capital_groups_owner_idx on finanko_private.capital_groups(owner_id);
create index capital_items_owner_group_idx on finanko_private.capital_items(owner_id, group_id);
create index capital_items_owner_income_destination_idx on finanko_private.capital_items(owner_id, income_destination_item_id) where income_destination_item_id is not null;
create index capital_events_owner_item_date_idx on finanko_private.capital_events(owner_id, item_id, occurred_at, id);
create index capital_events_owner_related_item_idx on finanko_private.capital_events(owner_id, related_item_id) where related_item_id is not null;
create index capital_events_owner_status_idx on finanko_private.capital_events(owner_id, status, occurred_at);
create unique index capital_events_external_unique_idx on finanko_private.capital_events(owner_id, external_provider, external_id) where external_provider is not null and external_id is not null;
create index capital_item_quotes_latest_idx on finanko_private.capital_item_quotes(owner_id, item_id, quoted_at desc);

drop function if exists public.get_capital_snapshot();
drop function if exists public.get_capital_snapshot(uuid);
drop function if exists public.save_capital_snapshot(jsonb);
drop function if exists public.save_capital_snapshot(uuid, jsonb);
drop function if exists public.save_capital_valuation(jsonb, numeric);
drop function if exists public.save_capital_valuation(uuid, jsonb, numeric);
drop function if exists public.rebuild_capital_history(jsonb, jsonb);
drop function if exists public.rebuild_capital_history(uuid, jsonb, jsonb);
drop function if exists public.delete_capital_group(text);
drop function if exists public.delete_capital_group(uuid, text);
drop function if exists public.delete_capital_item(text);
drop function if exists public.delete_capital_item(uuid, text);
drop function if exists public.delete_capital_event(text);
drop function if exists public.delete_capital_event(uuid, text);
drop function if exists public.delete_capital_event(uuid, text, jsonb);

create function public.get_capital_snapshot(expected_owner_id uuid)
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
    ) order by e.occurred_at, e.id) from finanko_private.capital_events e where e.owner_id = requester_id), '[]'::jsonb),
    'quotes', coalesce((select jsonb_agg(jsonb_build_object(
      'item_id', q.item_id, 'provider', q.provider, 'quote_currency', q.quote_currency,
      'quoted_at', q.quoted_at, 'price', q.price::text
    )) from (select distinct on (item_id) * from finanko_private.capital_item_quotes where owner_id = requester_id order by item_id, quoted_at desc) q), '[]'::jsonb),
    'quoteHistory', coalesce((select jsonb_agg(jsonb_build_object(
      'item_id', q.item_id, 'provider', q.provider, 'quote_currency', q.quote_currency,
      'quoted_at', q.quoted_at, 'price', q.price::text
    ) order by q.quoted_at) from finanko_private.capital_item_quotes q where q.owner_id = requester_id), '[]'::jsonb),
    'snapshots', coalesce((select jsonb_agg(jsonb_build_object(
      'snapshot_date', s.snapshot_date, 'reporting_currency', s.reporting_currency,
      'total_value', s.total_value::text
    ) order by s.snapshot_date) from finanko_private.capital_snapshots s where s.owner_id = requester_id), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_capital_snapshot(uuid) from public, anon;
grant execute on function public.get_capital_snapshot(uuid) to authenticated;

create function public.save_capital_snapshot(expected_owner_id uuid, capital_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_owner_id is distinct from requester_id then raise exception 'Authentication context changed' using errcode = '42501'; end if;
  if capital_data is null or jsonb_typeof(capital_data) <> 'object' then raise exception 'Invalid capital payload' using errcode = '22023'; end if;
  if exists (
    select 1 from finanko_private.capital_groups g
    join jsonb_array_elements(coalesce(capital_data->'groups', '[]'::jsonb)) rows(row) on g.id = row->>'id'
    where g.owner_id <> requester_id
  ) or exists (
    select 1 from finanko_private.capital_items i
    join jsonb_array_elements(coalesce(capital_data->'items', '[]'::jsonb)) rows(row) on i.id = row->>'id'
    where i.owner_id <> requester_id
  ) or exists (
    select 1 from finanko_private.capital_events e
    join jsonb_array_elements(coalesce(capital_data->'events', '[]'::jsonb)) rows(row) on e.id = row->>'id'
    where e.owner_id <> requester_id
  ) then
    raise exception 'Capital record belongs to another owner' using errcode = '42501';
  end if;

  insert into finanko_private.capital_groups (id, owner_id, name)
  select row->>'id', requester_id, row->>'name'
  from jsonb_array_elements(coalesce(capital_data->'groups', '[]'::jsonb)) rows(row)
  on conflict (id) do update set name = excluded.name, updated_at = now()
  where finanko_private.capital_groups.owner_id = requester_id;

  insert into finanko_private.capital_items (id, owner_id, group_id, name, item_type, symbol, quote_currency, manual_price, primary_provider, primary_asset_id, fallback_provider, fallback_asset_id, default_tax_rate, annual_interest_rate, interest_cadence, interest_effective_from, interest_compounding, income_destination_item_id)
  select row->>'id', requester_id, row->>'group_id', row->>'name', row->>'item_type', nullif(row->>'symbol', ''), row->>'quote_currency', nullif(row->>'manual_price', '')::numeric, nullif(row->>'primary_provider', ''), nullif(row->>'primary_asset_id', ''), nullif(row->>'fallback_provider', ''), nullif(row->>'fallback_asset_id', ''), nullif(row->>'default_tax_rate', '')::numeric, nullif(row->>'annual_interest_rate', '')::numeric, nullif(row->>'interest_cadence', ''), nullif(row->>'interest_effective_from', '')::date, coalesce((row->>'interest_compounding')::boolean, false), nullif(row->>'income_destination_item_id', '')
  from jsonb_array_elements(coalesce(capital_data->'items', '[]'::jsonb)) rows(row)
  on conflict (id) do update set group_id = excluded.group_id, name = excluded.name, item_type = excluded.item_type, symbol = excluded.symbol, quote_currency = excluded.quote_currency, manual_price = excluded.manual_price, primary_provider = excluded.primary_provider, primary_asset_id = excluded.primary_asset_id, fallback_provider = excluded.fallback_provider, fallback_asset_id = excluded.fallback_asset_id, default_tax_rate = excluded.default_tax_rate, annual_interest_rate = excluded.annual_interest_rate, interest_cadence = excluded.interest_cadence, interest_effective_from = excluded.interest_effective_from, interest_compounding = excluded.interest_compounding, income_destination_item_id = excluded.income_destination_item_id, updated_at = now()
  where finanko_private.capital_items.owner_id = requester_id;

  insert into finanko_private.capital_events (id, owner_id, item_id, related_item_id, event_type, status, occurred_at, quantity, amount, fee, tax, currency, split_ratio, source, reinvest, external_provider, external_id)
  select row->>'id', requester_id, row->>'item_id', nullif(row->>'related_item_id', ''), row->>'event_type', row->>'status', (row->>'occurred_at')::timestamptz, nullif(row->>'quantity', '')::numeric, nullif(row->>'amount', '')::numeric, nullif(row->>'fee', '')::numeric, nullif(row->>'tax', '')::numeric, row->>'currency', nullif(row->>'split_ratio', '')::numeric, row->>'source', coalesce((row->>'reinvest')::boolean, false), nullif(row->>'external_provider', ''), nullif(row->>'external_id', '')
  from jsonb_array_elements(coalesce(capital_data->'events', '[]'::jsonb)) rows(row)
  on conflict (id) do update set item_id = excluded.item_id, related_item_id = excluded.related_item_id, event_type = excluded.event_type, status = excluded.status, occurred_at = excluded.occurred_at, quantity = excluded.quantity, amount = excluded.amount, fee = excluded.fee, tax = excluded.tax, currency = excluded.currency, split_ratio = excluded.split_ratio, source = excluded.source, reinvest = excluded.reinvest, external_provider = excluded.external_provider, external_id = excluded.external_id, updated_at = now()
  where finanko_private.capital_events.owner_id = requester_id;

  if coalesce(jsonb_array_length(capital_data->'items'), 0) > 0
    or coalesce(jsonb_array_length(capital_data->'events'), 0) > 0
  then
    delete from finanko_private.capital_snapshots where owner_id = requester_id;
  end if;
end;
$$;
revoke all on function public.save_capital_snapshot(uuid, jsonb) from public, anon;
grant execute on function public.save_capital_snapshot(uuid, jsonb) to authenticated;

create function public.delete_capital_event(expected_owner_id uuid, target_id text, replacement_rows jsonb)
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

  delete from finanko_private.capital_snapshots where owner_id = requester_id;
end;
$$;
revoke all on function public.delete_capital_event(uuid, text, jsonb) from public, anon;
grant execute on function public.delete_capital_event(uuid, text, jsonb) to authenticated;

create function public.delete_capital_item(expected_owner_id uuid, target_id text)
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
  delete from finanko_private.capital_snapshots where owner_id = requester_id;
end;
$$;
revoke all on function public.delete_capital_item(uuid, text) from public, anon;
grant execute on function public.delete_capital_item(uuid, text) to authenticated;

create function public.delete_capital_group(expected_owner_id uuid, target_id text)
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
  delete from finanko_private.capital_snapshots where owner_id = requester_id;
end;
$$;
revoke all on function public.delete_capital_group(uuid, text) from public, anon;
grant execute on function public.delete_capital_group(uuid, text) to authenticated;

create function public.save_capital_valuation(expected_owner_id uuid, quote_rows jsonb, value_usd numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_owner_id is distinct from requester_id then raise exception 'Authentication context changed' using errcode = '42501'; end if;
  if quote_rows is null or jsonb_typeof(quote_rows) <> 'array' or value_usd is null or value_usd::text in ('NaN', 'Infinity', '-Infinity') then raise exception 'Invalid valuation payload' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(quote_rows) rows(row) where nullif(row->>'price', '') is null or lower(row->>'price') in ('nan', 'infinity', '-infinity', 'inf', '-inf') or (row->>'price')::numeric < 0) then raise exception 'Invalid valuation payload' using errcode = '22023'; end if;

  insert into finanko_private.capital_item_quotes (owner_id, item_id, provider, quote_currency, quoted_at, price)
  select requester_id, row->>'item_id', row->>'provider', row->>'currency', (row->>'quoted_at')::timestamptz, (row->>'price')::numeric
  from jsonb_array_elements(quote_rows) rows(row)
  where exists (select 1 from finanko_private.capital_items i where i.id = row->>'item_id' and i.owner_id = requester_id)
  on conflict (owner_id, item_id, provider, quoted_at) do update set price = excluded.price, retrieved_at = now();

  insert into finanko_private.capital_snapshots (owner_id, snapshot_date, reporting_currency, total_value)
  values (requester_id, (now() at time zone 'utc')::date, 'USD', value_usd)
  on conflict (owner_id, snapshot_date, reporting_currency) do update set total_value = excluded.total_value, updated_at = now();
end;
$$;
revoke all on function public.save_capital_valuation(uuid, jsonb, numeric) from public, anon;
grant execute on function public.save_capital_valuation(uuid, jsonb, numeric) to authenticated;

create function public.rebuild_capital_history(expected_owner_id uuid, quote_rows jsonb, snapshot_rows jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_owner_id is distinct from requester_id then raise exception 'Authentication context changed' using errcode = '42501'; end if;
  if quote_rows is null or snapshot_rows is null or jsonb_typeof(quote_rows) <> 'array' or jsonb_typeof(snapshot_rows) <> 'array' then raise exception 'Invalid history payload' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(quote_rows) rows(row) where nullif(row->>'price', '') is null or lower(row->>'price') in ('nan', 'infinity', '-infinity', 'inf', '-inf') or (row->>'price')::numeric < 0)
    or exists (select 1 from jsonb_array_elements(snapshot_rows) rows(row) where nullif(row->>'total_usd', '') is null or lower(row->>'total_usd') in ('nan', 'infinity', '-infinity', 'inf', '-inf'))
  then raise exception 'Invalid history payload' using errcode = '22023'; end if;

  insert into finanko_private.capital_item_quotes (owner_id, item_id, provider, quote_currency, quoted_at, price)
  select requester_id, row->>'item_id', row->>'provider', row->>'currency', (row->>'quoted_at')::timestamptz, (row->>'price')::numeric
  from jsonb_array_elements(quote_rows) rows(row)
  where exists (select 1 from finanko_private.capital_items i where i.id = row->>'item_id' and i.owner_id = requester_id)
  on conflict (owner_id, item_id, provider, quoted_at) do update set price = excluded.price, retrieved_at = now();

  delete from finanko_private.capital_snapshots where owner_id = requester_id;
  insert into finanko_private.capital_snapshots (owner_id, snapshot_date, reporting_currency, total_value)
  select requester_id, (row->>'date')::date, 'USD', (row->>'total_usd')::numeric
  from jsonb_array_elements(snapshot_rows) rows(row);
end;
$$;
revoke all on function public.rebuild_capital_history(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.rebuild_capital_history(uuid, jsonb, jsonb) to authenticated;
