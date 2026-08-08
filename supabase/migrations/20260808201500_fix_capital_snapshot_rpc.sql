-- Restore the writer after the legacy event columns were removed.
create or replace function public.save_capital_snapshot(capital_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(capital_data) <> 'object' then raise exception 'Invalid capital payload' using errcode = '22023'; end if;
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
end;
$$;
revoke all on function public.save_capital_snapshot(jsonb) from public, anon;
grant execute on function public.save_capital_snapshot(jsonb) to authenticated;
