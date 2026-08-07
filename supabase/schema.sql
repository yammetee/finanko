-- Minimal Finanko schema. Apply only after reviewing and running reset-public-schema.sql.
create schema if not exists finanko_private;
revoke all on schema finanko_private from public, anon, authenticated;

create table if not exists public.categories (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  color text not null check (char_length(btrim(color)) between 1 and 32),
  created_at timestamptz not null default now(),
  unique (owner_id, name),
  unique (id, owner_id)
);

create table if not exists public.expenses (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(20,4) not null check (amount <> 0),
  currency text not null check (currency in ('USD', 'GEL', 'RUB', 'THB')),
  category_id text not null,
  description text not null default '' check (char_length(description) <= 2000),
  occurred_at timestamptz not null,
  source text not null check (source in ('manual', 'text_ai', 'receipt_ai')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (category_id, owner_id)
    references public.categories(id, owner_id) on delete restrict
);

create table if not exists finanko_private.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists finanko_private.ai_usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  request_count integer not null default 0 check (request_count between 0 and 5),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create index if not exists expenses_owner_occurred_active_idx
  on public.expenses(owner_id, occurred_at desc)
  where deleted_at is null;
create index if not exists expenses_category_owner_idx
  on public.expenses(category_id, owner_id);

create or replace function finanko_private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function finanko_private.set_updated_at() from public, anon, authenticated;

drop trigger if exists set_updated_at on public.expenses;
create trigger set_updated_at
before update on public.expenses
for each row execute function finanko_private.set_updated_at();

drop trigger if exists set_updated_at on finanko_private.user_roles;
create trigger set_updated_at
before update on finanko_private.user_roles
for each row execute function finanko_private.set_updated_at();

alter table public.categories enable row level security;
alter table public.expenses enable row level security;
alter table finanko_private.user_roles enable row level security;
alter table finanko_private.ai_usage_daily enable row level security;

drop policy if exists owner_access on public.categories;
create policy owner_access on public.categories
for all to authenticated
using ((select auth.uid()) is not null and owner_id = (select auth.uid()))
with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));

drop policy if exists owner_access on public.expenses;
create policy owner_access on public.expenses
for all to authenticated
using ((select auth.uid()) is not null and owner_id = (select auth.uid()))
with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all tables in schema finanko_private from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert on public.categories to authenticated;
grant select, insert, update on public.expenses to authenticated;
-- Saves a batch of independent expenses in one transaction.
drop function if exists public.save_expense(jsonb, jsonb);
create or replace function public.save_expenses(expense_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
begin
  if requester_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(expense_rows) <> 'array' or jsonb_array_length(expense_rows) = 0 then
    raise exception 'Invalid expense batch' using errcode = '22023';
  end if;

  insert into public.expenses (
    id, owner_id, amount, currency, category_id, description,
    occurred_at, source, deleted_at
  )
  select
    row->>'id',
    requester_id,
    (row->>'amount')::numeric,
    row->>'currency',
    row->>'category_id',
    coalesce(row->>'description', ''),
    (row->>'occurred_at')::timestamptz,
    row->>'source',
    (row->>'deleted_at')::timestamptz
  from jsonb_array_elements(expense_rows) as rows(row)
  on conflict (id) do update set
    amount = excluded.amount,
    currency = excluded.currency,
    category_id = excluded.category_id,
    description = excluded.description,
    occurred_at = excluded.occurred_at,
    source = excluded.source,
    deleted_at = excluded.deleted_at
  where public.expenses.owner_id = requester_id;
end;
$$;
revoke all on function public.save_expenses(jsonb) from public, anon;
grant execute on function public.save_expenses(jsonb) to authenticated;

-- Regular users consume one of five UTC-day requests atomically. Admins bypass usage rows.
create or replace function public.consume_ai_daily_quota()
returns table (allowed boolean, is_admin boolean, requests_used integer, requests_limit integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  request_day date := (now() at time zone 'utc')::date;
  admin_user boolean := false;
  used_count integer;
begin
  if requester_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select exists (
    select 1
    from finanko_private.user_roles as roles
    where roles.user_id = requester_id and roles.role = 'admin'
  ) into admin_user;

  if admin_user then
    return query select true, true, 0, null::integer;
    return;
  end if;

  insert into finanko_private.ai_usage_daily as usage (
    user_id, usage_date, request_count, updated_at
  )
  values (requester_id, request_day, 1, now())
  on conflict (user_id, usage_date) do update
    set request_count = usage.request_count + 1,
        updated_at = now()
    where usage.request_count < 5
  returning usage.request_count into used_count;

  if used_count is null then
    select usage.request_count
    into used_count
    from finanko_private.ai_usage_daily as usage
    where usage.user_id = requester_id and usage.usage_date = request_day;

    return query select false, false, coalesce(used_count, 5), 5;
    return;
  end if;

  return query select true, false, used_count, 5;
end;
$$;
revoke all on function public.consume_ai_daily_quota() from public, anon;
grant execute on function public.consume_ai_daily_quota() to authenticated;
