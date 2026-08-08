create schema if not exists finanko_private;
revoke all on schema finanko_private from public, anon, authenticated;

create table if not exists finanko_private.debt_groups (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (owner_id, name)
);

create table if not exists finanko_private.debts (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  group_id text not null,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  lender text check (lender is null or char_length(btrim(lender)) between 1 and 160),
  loan_type text not null check (loan_type in ('consumer', 'mortgage')),
  currency text not null check (currency in ('USD', 'GEL', 'RUB', 'THB')),
  principal_balance numeric(38,18) not null check (principal_balance > 0),
  annual_rate numeric(38,18) not null check (annual_rate > 0 and annual_rate <= 1),
  required_payment numeric(38,18) not null check (required_payment > 0),
  balance_date date not null,
  next_payment_date date not null check (next_payment_date >= balance_date),
  remaining_payments integer not null check (remaining_payments > 0),
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (group_id, owner_id)
    references finanko_private.debt_groups(id, owner_id) on delete cascade
);

create table if not exists finanko_private.debt_payments (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  debt_id text not null,
  event_type text not null check (event_type in ('payment', 'reconciliation')),
  occurred_at timestamptz not null,
  event_sequence integer not null check (event_sequence >= 0),
  amount numeric(38,18),
  strategy text check (strategy is null or strategy in ('scheduled', 'reduce_term', 'reduce_payment', 'full')),
  reconciled_principal numeric(38,18),
  interest_amount numeric(38,18),
  scheduled_principal numeric(38,18),
  early_principal numeric(38,18),
  principal_after numeric(38,18) not null check (principal_after >= 0),
  required_payment_after numeric(38,18) not null check (required_payment_after >= 0),
  remaining_payments_after integer not null check (remaining_payments_after >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (owner_id, debt_id, occurred_at, event_sequence),
  foreign key (debt_id, owner_id)
    references finanko_private.debts(id, owner_id) on delete cascade,
  constraint debt_payments_values_check check (
    (event_type = 'payment'
      and amount is not null and amount > 0
      and strategy is not null
      and reconciled_principal is null
      and interest_amount is not null and interest_amount >= 0
      and scheduled_principal is not null and scheduled_principal >= 0
      and early_principal is not null and early_principal >= 0)
    or
    (event_type = 'reconciliation'
      and amount is null and strategy is null
      and reconciled_principal is not null and reconciled_principal >= 0
      and interest_amount is null and scheduled_principal is null and early_principal is null)
  )
);

create index if not exists debt_groups_owner_idx on finanko_private.debt_groups(owner_id);
create index if not exists debts_owner_group_idx on finanko_private.debts(owner_id, group_id);
create index if not exists debts_owner_status_idx on finanko_private.debts(owner_id, status);
create index if not exists debt_payments_owner_debt_date_idx on finanko_private.debt_payments(owner_id, debt_id, occurred_at, event_sequence, id);

drop trigger if exists set_updated_at on finanko_private.debt_groups;
create trigger set_updated_at before update on finanko_private.debt_groups
for each row execute function finanko_private.set_updated_at();
drop trigger if exists set_updated_at on finanko_private.debts;
create trigger set_updated_at before update on finanko_private.debts
for each row execute function finanko_private.set_updated_at();
drop trigger if exists set_updated_at on finanko_private.debt_payments;
create trigger set_updated_at before update on finanko_private.debt_payments
for each row execute function finanko_private.set_updated_at();

alter table finanko_private.debt_groups enable row level security;
alter table finanko_private.debts enable row level security;
alter table finanko_private.debt_payments enable row level security;
revoke all on finanko_private.debt_groups, finanko_private.debts, finanko_private.debt_payments from public, anon, authenticated;

drop function if exists public.get_debt_snapshot();
drop function if exists public.save_debt_snapshot(jsonb);
drop function if exists public.delete_debt_group(text);
drop function if exists public.delete_debt(text);
drop function if exists public.delete_debt_payment(text);

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
    ) order by d.created_at, d.id) from finanko_private.debts d where d.owner_id = requester_id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'debt_id', p.debt_id, 'event_type', p.event_type, 'occurred_at', p.occurred_at,
      'event_sequence', p.event_sequence, 'amount', p.amount::text, 'strategy', p.strategy,
      'reconciled_principal', p.reconciled_principal::text, 'interest_amount', p.interest_amount::text,
      'scheduled_principal', p.scheduled_principal::text, 'early_principal', p.early_principal::text,
      'principal_after', p.principal_after::text, 'required_payment_after', p.required_payment_after::text,
      'remaining_payments_after', p.remaining_payments_after
    ) order by p.occurred_at, p.event_sequence, p.id) from finanko_private.debt_payments p where p.owner_id = requester_id), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_debt_snapshot(uuid) from public, anon;
grant execute on function public.get_debt_snapshot(uuid) to authenticated;

create or replace function public.save_debt_snapshot(expected_owner_id uuid, debt_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_owner_id is distinct from requester_id then raise exception 'Authentication context changed' using errcode = '42501'; end if;
  if debt_data is null or jsonb_typeof(debt_data) <> 'object' then raise exception 'Invalid debt payload' using errcode = '22023'; end if;
  if exists (select 1 from finanko_private.debt_groups g join jsonb_array_elements(coalesce(debt_data->'groups', '[]'::jsonb)) rows(row) on g.id = row->>'id' where g.owner_id <> requester_id)
    or exists (select 1 from finanko_private.debts d join jsonb_array_elements(coalesce(debt_data->'debts', '[]'::jsonb)) rows(row) on d.id = row->>'id' where d.owner_id <> requester_id)
    or exists (select 1 from finanko_private.debt_payments p join jsonb_array_elements(coalesce(debt_data->'payments', '[]'::jsonb)) rows(row) on p.id = row->>'id' where p.owner_id <> requester_id)
  then raise exception 'Debt record belongs to another owner' using errcode = '42501'; end if;

  insert into finanko_private.debt_groups (id, owner_id, name)
  select row->>'id', requester_id, row->>'name' from jsonb_array_elements(coalesce(debt_data->'groups', '[]'::jsonb)) rows(row)
  on conflict (id) do update set name = excluded.name where finanko_private.debt_groups.owner_id = requester_id;

  insert into finanko_private.debts (id, owner_id, group_id, name, lender, loan_type, currency, principal_balance, annual_rate, required_payment, balance_date, next_payment_date, remaining_payments, status)
  select row->>'id', requester_id, row->>'group_id', row->>'name', nullif(row->>'lender', ''), row->>'loan_type', row->>'currency',
    (row->>'principal_balance')::numeric, (row->>'annual_rate')::numeric, (row->>'required_payment')::numeric,
    (row->>'balance_date')::date, (row->>'next_payment_date')::date, (row->>'remaining_payments')::integer, row->>'status'
  from jsonb_array_elements(coalesce(debt_data->'debts', '[]'::jsonb)) rows(row)
  on conflict (id) do update set group_id = excluded.group_id, name = excluded.name, lender = excluded.lender,
    loan_type = excluded.loan_type, currency = excluded.currency, principal_balance = excluded.principal_balance,
    annual_rate = excluded.annual_rate, required_payment = excluded.required_payment, balance_date = excluded.balance_date,
    next_payment_date = excluded.next_payment_date, remaining_payments = excluded.remaining_payments, status = excluded.status
  where finanko_private.debts.owner_id = requester_id;

  insert into finanko_private.debt_payments (id, owner_id, debt_id, event_type, occurred_at, event_sequence, amount, strategy, reconciled_principal, interest_amount, scheduled_principal, early_principal, principal_after, required_payment_after, remaining_payments_after)
  select row->>'id', requester_id, row->>'debt_id', row->>'event_type', (row->>'occurred_at')::timestamptz,
    (row->>'event_sequence')::integer, nullif(row->>'amount', '')::numeric, nullif(row->>'strategy', ''),
    nullif(row->>'reconciled_principal', '')::numeric, nullif(row->>'interest_amount', '')::numeric,
    nullif(row->>'scheduled_principal', '')::numeric, nullif(row->>'early_principal', '')::numeric,
    (row->>'principal_after')::numeric, (row->>'required_payment_after')::numeric, (row->>'remaining_payments_after')::integer
  from jsonb_array_elements(coalesce(debt_data->'payments', '[]'::jsonb)) rows(row)
  on conflict (id) do update set debt_id = excluded.debt_id, event_type = excluded.event_type,
    occurred_at = excluded.occurred_at, event_sequence = excluded.event_sequence, amount = excluded.amount,
    strategy = excluded.strategy, reconciled_principal = excluded.reconciled_principal,
    interest_amount = excluded.interest_amount, scheduled_principal = excluded.scheduled_principal,
    early_principal = excluded.early_principal, principal_after = excluded.principal_after,
    required_payment_after = excluded.required_payment_after, remaining_payments_after = excluded.remaining_payments_after
  where finanko_private.debt_payments.owner_id = requester_id;
end;
$$;
revoke all on function public.save_debt_snapshot(uuid, jsonb) from public, anon;
grant execute on function public.save_debt_snapshot(uuid, jsonb) to authenticated;

create or replace function public.delete_debt_group(expected_owner_id uuid, target_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_owner_id is distinct from requester_id then raise exception 'Authentication context changed' using errcode = '42501'; end if;
  if exists (select 1 from finanko_private.debt_groups where id = target_id and owner_id <> requester_id) then raise exception 'Debt record belongs to another owner' using errcode = '42501'; end if;
  delete from finanko_private.debt_groups where id = target_id and owner_id = requester_id;
end;
$$;
revoke all on function public.delete_debt_group(uuid, text) from public, anon;
grant execute on function public.delete_debt_group(uuid, text) to authenticated;

create or replace function public.delete_debt(expected_owner_id uuid, target_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_owner_id is distinct from requester_id then raise exception 'Authentication context changed' using errcode = '42501'; end if;
  if exists (select 1 from finanko_private.debts where id = target_id and owner_id <> requester_id) then raise exception 'Debt record belongs to another owner' using errcode = '42501'; end if;
  delete from finanko_private.debts where id = target_id and owner_id = requester_id;
end;
$$;
revoke all on function public.delete_debt(uuid, text) from public, anon;
grant execute on function public.delete_debt(uuid, text) to authenticated;

create or replace function public.delete_debt_payment(expected_owner_id uuid, target_id text, replacement_rows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_owner_id is distinct from requester_id then raise exception 'Authentication context changed' using errcode = '42501'; end if;
  if replacement_rows is null or jsonb_typeof(replacement_rows) <> 'array' then raise exception 'Invalid replacement payments payload' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(replacement_rows) rows(row) where row->>'id' = target_id) then raise exception 'Deleted payment cannot be recreated' using errcode = '22023'; end if;
  if exists (select 1 from finanko_private.debt_payments where id = target_id and owner_id <> requester_id) then raise exception 'Debt record belongs to another owner' using errcode = '42501'; end if;
  if exists (select 1 from finanko_private.debt_payments p join jsonb_array_elements(replacement_rows) rows(row) on p.id = row->>'id' where p.owner_id <> requester_id) then raise exception 'Debt record belongs to another owner' using errcode = '42501'; end if;
  delete from finanko_private.debt_payments where id = target_id and owner_id = requester_id;
  insert into finanko_private.debt_payments (id, owner_id, debt_id, event_type, occurred_at, event_sequence, amount, strategy, reconciled_principal, interest_amount, scheduled_principal, early_principal, principal_after, required_payment_after, remaining_payments_after)
  select row->>'id', requester_id, row->>'debt_id', row->>'event_type', (row->>'occurred_at')::timestamptz,
    (row->>'event_sequence')::integer, nullif(row->>'amount', '')::numeric, nullif(row->>'strategy', ''),
    nullif(row->>'reconciled_principal', '')::numeric, nullif(row->>'interest_amount', '')::numeric,
    nullif(row->>'scheduled_principal', '')::numeric, nullif(row->>'early_principal', '')::numeric,
    (row->>'principal_after')::numeric, (row->>'required_payment_after')::numeric, (row->>'remaining_payments_after')::integer
  from jsonb_array_elements(replacement_rows) rows(row)
  on conflict (id) do update set debt_id = excluded.debt_id, event_type = excluded.event_type,
    occurred_at = excluded.occurred_at, event_sequence = excluded.event_sequence, amount = excluded.amount,
    strategy = excluded.strategy, reconciled_principal = excluded.reconciled_principal,
    interest_amount = excluded.interest_amount, scheduled_principal = excluded.scheduled_principal,
    early_principal = excluded.early_principal, principal_after = excluded.principal_after,
    required_payment_after = excluded.required_payment_after, remaining_payments_after = excluded.remaining_payments_after
  where finanko_private.debt_payments.owner_id = requester_id;
end;
$$;
revoke all on function public.delete_debt_payment(uuid, text, jsonb) from public, anon;
grant execute on function public.delete_debt_payment(uuid, text, jsonb) to authenticated;
