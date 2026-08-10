drop index if exists public.expenses_owner_occurred_active_idx;
create index if not exists expenses_owner_occurred_id_active_idx
  on public.expenses(owner_id, occurred_at desc, id desc)
  where deleted_at is null;
create index if not exists debt_payments_owner_date_page_idx
  on finanko_private.debt_payments(owner_id, occurred_at desc, event_sequence desc, id desc);

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
    'quotes', coalesce((select jsonb_agg(jsonb_build_object(
      'item_id', q.item_id, 'provider', q.provider, 'quote_currency', q.quote_currency,
      'quoted_at', q.quoted_at, 'price', q.price::text
    )) from (select distinct on (item_id) * from finanko_private.capital_item_quotes where owner_id = requester_id order by item_id, quoted_at desc) q), '[]'::jsonb),
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

create or replace function public.get_capital_quote_history(expected_owner_id uuid)
returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_owner_id is distinct from requester_id then raise exception 'Authentication context changed' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'item_id', quote.item_id, 'provider', quote.provider, 'quote_currency', quote.quote_currency,
    'quoted_at', quote.quoted_at, 'price', quote.price::text
  ) order by quote.quoted_at) from finanko_private.capital_item_quotes quote where quote.owner_id = requester_id), '[]'::jsonb);
end;
$$;

revoke all on function public.get_capital_quote_history(uuid) from public, anon;
grant execute on function public.get_capital_quote_history(uuid) to authenticated;

create or replace function public.get_financial_summary(expected_owner_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if expected_owner_id is distinct from requester_id then
    raise exception 'Authentication context changed' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'capital_total_usd', (
      select snapshot.total_value::text
      from finanko_private.capital_snapshots snapshot
      where snapshot.owner_id = requester_id
        and snapshot.reporting_currency = 'USD'
      order by snapshot.snapshot_date desc
      limit 1
    ),
    'debt_totals', coalesce((
      select jsonb_object_agg(totals.currency, totals.total::text)
      from (
        select debt.currency, sum(coalesce(latest.principal_after, debt.principal_balance)) as total
        from finanko_private.debts debt
        left join lateral (
          select payment.principal_after
          from finanko_private.debt_payments payment
          where payment.owner_id = requester_id
            and payment.debt_id = debt.id
          order by payment.occurred_at desc, payment.event_sequence desc, payment.id desc
          limit 1
        ) latest on true
        where debt.owner_id = requester_id
          and coalesce(latest.principal_after, debt.principal_balance) > 0
        group by debt.currency
      ) totals
    ), '{}'::jsonb)
  );
end;
$$;

revoke all on function public.get_financial_summary(uuid) from public, anon;
grant execute on function public.get_financial_summary(uuid) to authenticated;

create or replace function public.get_debt_snapshot(expected_owner_id uuid)
returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_owner_id is distinct from requester_id then raise exception 'Authentication context changed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by g.created_at, g.id) from finanko_private.debt_groups g where g.owner_id = requester_id), '[]'::jsonb),
    'debts', coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id, 'group_id', d.group_id, 'name', d.name, 'lender', d.lender,
      'loan_type', d.loan_type, 'currency', d.currency, 'principal_balance', d.principal_balance::text,
      'annual_rate', d.annual_rate::text, 'required_payment', d.required_payment::text,
      'balance_date', d.balance_date, 'next_payment_date', d.next_payment_date,
      'remaining_payments', d.remaining_payments, 'status', d.status
    ) order by d.created_at, d.id) from finanko_private.debts d where d.owner_id = requester_id), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_debt_snapshot(uuid) from public, anon;
grant execute on function public.get_debt_snapshot(uuid) to authenticated;

create or replace function public.get_debt_payments_page(
  expected_owner_id uuid,
  cursor_occurred_at timestamptz default null,
  cursor_sequence integer default null,
  cursor_id text default null,
  page_size integer default 500
)
returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_owner_id is distinct from requester_id then raise exception 'Authentication context changed' using errcode = '42501'; end if;
  if page_size < 1 or page_size > 500 then raise exception 'Invalid page size' using errcode = '22023'; end if;
  if (cursor_occurred_at is null) <> (cursor_sequence is null) or (cursor_occurred_at is null) <> (cursor_id is null) then raise exception 'Invalid debt cursor' using errcode = '22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', page.id, 'debt_id', page.debt_id, 'event_type', page.event_type, 'occurred_at', page.occurred_at,
    'event_sequence', page.event_sequence, 'amount', page.amount::text, 'strategy', page.strategy,
    'reconciled_principal', page.reconciled_principal::text
  ) order by page.occurred_at desc, page.event_sequence desc, page.id desc) from (
    select payment.*
    from finanko_private.debt_payments payment
    where payment.owner_id = requester_id
      and (cursor_occurred_at is null or (payment.occurred_at, payment.event_sequence, payment.id) < (cursor_occurred_at, cursor_sequence, cursor_id))
    order by payment.occurred_at desc, payment.event_sequence desc, payment.id desc
    limit page_size
  ) page), '[]'::jsonb);
end;
$$;

revoke all on function public.get_debt_payments_page(uuid, timestamptz, integer, text, integer) from public, anon;
grant execute on function public.get_debt_payments_page(uuid, timestamptz, integer, text, integer) to authenticated;
