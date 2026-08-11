create or replace function public.get_capital_snapshot(expected_owner_id uuid)
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
    'snapshots', coalesce((select jsonb_agg(jsonb_build_object(
      'snapshot_date', s.snapshot_date, 'reporting_currency', s.reporting_currency,
      'total_value', s.total_value::text
    ) order by s.snapshot_date) from (
      select snapshot_date, reporting_currency, total_value
      from finanko_private.capital_snapshots
      where owner_id = requester_id
      order by snapshot_date desc
      limit 366
    ) s), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_capital_snapshot(uuid) from public, anon;
grant execute on function public.get_capital_snapshot(uuid) to authenticated;

drop function if exists public.get_capital_quote_history(uuid);
drop function if exists public.save_capital_valuation(uuid, jsonb, numeric);

create function public.save_capital_valuation(expected_owner_id uuid, value_usd numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_owner_id is distinct from requester_id then raise exception 'Authentication context changed' using errcode = '42501'; end if;
  if value_usd is null or value_usd::text in ('NaN', 'Infinity', '-Infinity') then raise exception 'Invalid valuation payload' using errcode = '22023'; end if;

  insert into finanko_private.capital_snapshots (owner_id, snapshot_date, reporting_currency, total_value)
  values (requester_id, (now() at time zone 'utc')::date, 'USD', value_usd)
  on conflict (owner_id, snapshot_date, reporting_currency) do update set total_value = excluded.total_value, updated_at = now();
end;
$$;

revoke all on function public.save_capital_valuation(uuid, numeric) from public, anon;
grant execute on function public.save_capital_valuation(uuid, numeric) to authenticated;

drop function if exists public.rebuild_capital_history(uuid, jsonb, jsonb);

create function public.rebuild_capital_history(expected_owner_id uuid, snapshot_rows jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_owner_id is distinct from requester_id then raise exception 'Authentication context changed' using errcode = '42501'; end if;
  if snapshot_rows is null or jsonb_typeof(snapshot_rows) <> 'array'
    or exists (select 1 from jsonb_array_elements(snapshot_rows) rows(row) where nullif(row->>'total_usd', '') is null or lower(row->>'total_usd') in ('nan', 'infinity', '-infinity', 'inf', '-inf'))
  then raise exception 'Invalid history payload' using errcode = '22023'; end if;

  delete from finanko_private.capital_snapshots where owner_id = requester_id;
  insert into finanko_private.capital_snapshots (owner_id, snapshot_date, reporting_currency, total_value)
  select requester_id, (row->>'date')::date, 'USD', (row->>'total_usd')::numeric
  from jsonb_array_elements(snapshot_rows) rows(row);
end;
$$;

revoke all on function public.rebuild_capital_history(uuid, jsonb) from public, anon;
grant execute on function public.rebuild_capital_history(uuid, jsonb) to authenticated;

drop table if exists finanko_private.capital_item_quotes;

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
