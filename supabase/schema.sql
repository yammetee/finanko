-- Minimal Finanko schema.
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

create table if not exists finanko_private.capital_groups (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table if not exists finanko_private.capital_items (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  group_id text not null,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  item_type text not null check (item_type in ('stock', 'fund', 'crypto', 'cash', 'deposit')),
  symbol text,
  quote_currency text not null check (quote_currency in ('USD', 'GEL', 'RUB', 'THB')),
  manual_price numeric(30,10) check (manual_price is null or manual_price >= 0),
  primary_provider text,
  primary_asset_id text,
  fallback_provider text,
  fallback_asset_id text,
  default_tax_rate numeric(9,6) check (default_tax_rate is null or default_tax_rate between 0 and 1),
  annual_interest_rate numeric(12,9) check (annual_interest_rate is null or annual_interest_rate >= 0),
  interest_cadence text check (interest_cadence is null or interest_cadence in ('monthly', 'quarterly', 'yearly')),
  interest_effective_from date,
  interest_compounding boolean not null default false,
  income_destination_item_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (group_id, owner_id)
    references finanko_private.capital_groups(id, owner_id) on delete restrict,
  foreign key (income_destination_item_id, owner_id)
    references finanko_private.capital_items(id, owner_id) on delete restrict,
  check (income_destination_item_id is null or income_destination_item_id <> id)
);

create table if not exists finanko_private.capital_events (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  related_item_id text,
  event_type text not null check (event_type in ('buy', 'sell', 'deposit', 'withdrawal', 'transfer', 'dividend', 'interest', 'staking', 'fee', 'tax', 'split', 'adjustment')),
  status text not null check (status in ('expected', 'confirmed', 'ignored')),
  occurred_at timestamptz not null,
  quantity numeric(38,18),
  amount numeric(30,10),
  fee numeric(30,10) check (fee is null or fee >= 0),
  tax numeric(30,10) check (tax is null or tax >= 0),
  currency text not null check (currency in ('USD', 'GEL', 'RUB', 'THB')),
  split_ratio numeric(30,18) check (split_ratio is null or split_ratio > 0),
  source text not null check (source in ('manual', 'automatic')),
  external_provider text,
  external_id text,
  reinvest boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (item_id, owner_id)
    references finanko_private.capital_items(id, owner_id) on delete restrict,
  foreign key (related_item_id, owner_id)
    references finanko_private.capital_items(id, owner_id) on delete restrict,
  check (related_item_id is null or related_item_id <> item_id),
  constraint capital_events_required_values_check check (
    (event_type in ('buy', 'sell', 'staking') and quantity > 0 and amount > 0)
    or (event_type in ('deposit', 'withdrawal', 'transfer') and (quantity > 0 or amount > 0))
    or (event_type in ('dividend', 'interest', 'fee', 'tax') and amount > 0)
    or (event_type = 'split' and split_ratio > 0)
    or (event_type = 'adjustment' and (quantity <> 0 or amount <> 0))
  )
);

create table if not exists finanko_private.capital_snapshots (
  owner_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,
  reporting_currency text not null default 'USD' check (reporting_currency = 'USD'),
  total_value numeric(30,10) not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, snapshot_date, reporting_currency)
);

create table if not exists finanko_private.capital_item_quotes (
  owner_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  provider text not null,
  quote_currency text not null check (quote_currency in ('USD', 'GEL', 'RUB', 'THB')),
  quoted_at timestamptz not null,
  price numeric(30,10) not null check (price >= 0),
  retrieved_at timestamptz not null default now(),
  primary key (owner_id, item_id, provider, quoted_at),
  foreign key (item_id, owner_id)
    references finanko_private.capital_items(id, owner_id) on delete cascade
);

create index if not exists expenses_owner_occurred_active_idx
  on public.expenses(owner_id, occurred_at desc)
  where deleted_at is null;
create index if not exists expenses_category_owner_idx
  on public.expenses(category_id, owner_id);
create index if not exists capital_groups_owner_idx on finanko_private.capital_groups(owner_id);
create index if not exists capital_items_owner_group_idx on finanko_private.capital_items(owner_id, group_id);
create index if not exists capital_events_owner_item_date_idx on finanko_private.capital_events(owner_id, item_id, occurred_at, id);
create index if not exists capital_events_owner_status_idx on finanko_private.capital_events(owner_id, status, occurred_at);
create unique index if not exists capital_events_external_unique_idx on finanko_private.capital_events(owner_id, external_provider, external_id) where external_provider is not null and external_id is not null;
create index if not exists capital_item_quotes_latest_idx on finanko_private.capital_item_quotes(owner_id, item_id, quoted_at desc);

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
alter table finanko_private.capital_groups enable row level security;
alter table finanko_private.capital_items enable row level security;
alter table finanko_private.capital_events enable row level security;
alter table finanko_private.capital_snapshots enable row level security;
alter table finanko_private.capital_item_quotes enable row level security;

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

create or replace function public.get_capital_snapshot()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select case when (select auth.uid()) is null then
    null
  else jsonb_build_object(
    'groups', coalesce((select jsonb_agg(to_jsonb(g) - 'owner_id' - 'created_at' - 'updated_at' order by g.created_at) from finanko_private.capital_groups g where g.owner_id = (select auth.uid())), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(to_jsonb(i) - 'owner_id' - 'created_at' - 'updated_at' order by i.created_at) from finanko_private.capital_items i where i.owner_id = (select auth.uid())), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) - 'owner_id' - 'created_at' - 'updated_at' order by e.occurred_at, e.id) from finanko_private.capital_events e where e.owner_id = (select auth.uid())), '[]'::jsonb),
    'quotes', coalesce((select jsonb_agg(to_jsonb(q) - 'owner_id' - 'retrieved_at') from (select distinct on (item_id) * from finanko_private.capital_item_quotes where owner_id = (select auth.uid()) order by item_id, quoted_at desc) q), '[]'::jsonb),
    'quoteHistory', coalesce((select jsonb_agg(to_jsonb(q) - 'owner_id' - 'retrieved_at' order by q.quoted_at) from finanko_private.capital_item_quotes q where q.owner_id = (select auth.uid())), '[]'::jsonb),
    'snapshots', coalesce((select jsonb_agg(to_jsonb(s) - 'owner_id' - 'updated_at' order by s.snapshot_date) from finanko_private.capital_snapshots s where s.owner_id = (select auth.uid())), '[]'::jsonb)
  ) end;
$$;
revoke all on function public.get_capital_snapshot() from public, anon;
grant execute on function public.get_capital_snapshot() to authenticated;

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

create or replace function public.delete_capital_event(target_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  delete from finanko_private.capital_events where id = target_id and owner_id = requester_id;
  delete from finanko_private.capital_snapshots where owner_id = requester_id;
end;
$$;
revoke all on function public.delete_capital_event(text) from public, anon;
grant execute on function public.delete_capital_event(text) to authenticated;

create or replace function public.delete_capital_item(target_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update finanko_private.capital_items set income_destination_item_id = null where owner_id = requester_id and income_destination_item_id = target_id;
  delete from finanko_private.capital_events where owner_id = requester_id and (item_id = target_id or related_item_id = target_id);
  delete from finanko_private.capital_items where id = target_id and owner_id = requester_id;
  delete from finanko_private.capital_snapshots where owner_id = requester_id;
end;
$$;
revoke all on function public.delete_capital_item(text) from public, anon;
grant execute on function public.delete_capital_item(text) to authenticated;

create or replace function public.delete_capital_group(target_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update finanko_private.capital_items set income_destination_item_id = null
    where owner_id = requester_id and income_destination_item_id in (select id from finanko_private.capital_items where owner_id = requester_id and group_id = target_id);
  delete from finanko_private.capital_events where owner_id = requester_id and (
    item_id in (select id from finanko_private.capital_items where owner_id = requester_id and group_id = target_id)
    or related_item_id in (select id from finanko_private.capital_items where owner_id = requester_id and group_id = target_id)
  );
  delete from finanko_private.capital_items where owner_id = requester_id and group_id = target_id;
  delete from finanko_private.capital_groups where id = target_id and owner_id = requester_id;
  delete from finanko_private.capital_snapshots where owner_id = requester_id;
end;
$$;
revoke all on function public.delete_capital_group(text) from public, anon;
grant execute on function public.delete_capital_group(text) to authenticated;

create or replace function public.save_capital_valuation(quote_rows jsonb, value_usd numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(quote_rows) <> 'array' or value_usd < 0 then raise exception 'Invalid valuation payload' using errcode = '22023'; end if;

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
revoke all on function public.save_capital_valuation(jsonb, numeric) from public, anon;
grant execute on function public.save_capital_valuation(jsonb, numeric) to authenticated;

create or replace function public.rebuild_capital_history(quote_rows jsonb, snapshot_rows jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare requester_id uuid := (select auth.uid());
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(quote_rows) <> 'array' or jsonb_typeof(snapshot_rows) <> 'array' then raise exception 'Invalid history payload' using errcode = '22023'; end if;
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
revoke all on function public.rebuild_capital_history(jsonb, jsonb) from public, anon;
grant execute on function public.rebuild_capital_history(jsonb, jsonb) to authenticated;
