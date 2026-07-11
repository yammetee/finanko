-- Finanko relational schema. Run in the Supabase SQL editor or with `supabase db push`.
create table if not exists public.portfolios (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  base_currency text not null check (base_currency in ('USD', 'GEL', 'RUB', 'THB')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounts (
  id text primary key,
  portfolio_id text not null references public.portfolios(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  type text not null check (type in ('cash','bank','card','savings','investment','crypto','debt','credit','mortgage','custom')),
  currency text not null check (currency in ('USD', 'GEL', 'RUB', 'THB')),
  initial_balance numeric(20,4) not null default 0,
  color text not null,
  annual_interest_rate numeric(9,6),
  interest_frequency text check (interest_frequency in ('daily', 'monthly')),
  interest_started_at timestamptz,
  interest_allocation_account_id text references public.accounts(id) on delete set null,
  loan_term_months integer check (loan_term_months is null or loan_term_months > 0),
  is_archived boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id text primary key,
  portfolio_id text not null references public.portfolios(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  type text not null check (type in ('income', 'expense')),
  color text not null,
  created_at timestamptz not null default now(),
  unique (portfolio_id, type, name)
);

create table if not exists public.recurring_rules (
  id text primary key,
  portfolio_id text not null references public.portfolios(id) on delete cascade,
  account_id text not null references public.accounts(id) on delete restrict,
  type text not null check (type in ('income', 'expense')),
  amount numeric(20,4) not null check (amount >= 0),
  currency text not null check (currency in ('USD', 'GEL', 'RUB', 'THB')),
  category_id text not null references public.categories(id) on delete restrict,
  description text not null default '',
  day_of_month smallint not null check (day_of_month between 1 and 31),
  starts_at timestamptz not null,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id text primary key,
  portfolio_id text not null references public.portfolios(id) on delete cascade,
  account_id text not null references public.accounts(id) on delete restrict,
  type text not null check (type in ('income','expense','debt_payment','interest_accrual','adjustment')),
  amount numeric(20,4) not null check (amount >= 0),
  currency text not null check (currency in ('USD', 'GEL', 'RUB', 'THB')),
  category_id text references public.categories(id) on delete restrict,
  linked_account_id text references public.accounts(id) on delete restrict,
  principal_amount numeric(20,4),
  interest_amount numeric(20,4),
  description text not null default '',
  occurred_at timestamptz not null,
  source text not null check (source in ('manual','text_ai','receipt_ai','recurring','system')),
  recurring_rule_id text references public.recurring_rules(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (type <> 'debt_payment' or linked_account_id is not null),
  check (principal_amount is null or principal_amount >= 0),
  check (interest_amount is null or interest_amount >= 0)
);

create table if not exists public.transaction_items (
  id text primary key,
  transaction_id text not null references public.transactions(id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  amount numeric(20,4) not null,
  quantity numeric(20,4),
  unit_price numeric(20,4),
  category_id text not null references public.categories(id) on delete restrict,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  created_at timestamptz not null default now()
);

create index if not exists portfolios_owner_id_idx on public.portfolios(owner_id) where deleted_at is null;
create index if not exists accounts_portfolio_id_idx on public.accounts(portfolio_id) where deleted_at is null;
create index if not exists accounts_interest_allocation_idx on public.accounts(interest_allocation_account_id);
create index if not exists categories_portfolio_id_idx on public.categories(portfolio_id);
create index if not exists recurring_rules_portfolio_active_idx on public.recurring_rules(portfolio_id, is_active);
create index if not exists recurring_rules_account_id_idx on public.recurring_rules(account_id);
create index if not exists recurring_rules_category_id_idx on public.recurring_rules(category_id);
create index if not exists transactions_portfolio_occurred_idx on public.transactions(portfolio_id, occurred_at desc) where deleted_at is null;
create index if not exists transactions_account_id_idx on public.transactions(account_id);
create index if not exists transactions_category_id_idx on public.transactions(category_id);
create index if not exists transactions_linked_account_id_idx on public.transactions(linked_account_id);
create index if not exists transactions_recurring_rule_id_idx on public.transactions(recurring_rule_id);
create index if not exists transaction_items_transaction_id_idx on public.transaction_items(transaction_id);
create index if not exists transaction_items_category_id_idx on public.transaction_items(category_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
revoke all on function public.set_updated_at() from public, anon, authenticated;

do $$ declare table_name text; begin
  foreach table_name in array array['portfolios','accounts','recurring_rules','transactions'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name);
  end loop;
end $$;

alter table public.portfolios enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;

create or replace function public.owns_portfolio(target_portfolio_id text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from public.portfolios p where p.id = target_portfolio_id and p.owner_id = (select auth.uid()));
$$;
revoke all on function public.owns_portfolio(text) from public, anon;
grant execute on function public.owns_portfolio(text) to authenticated;

drop policy if exists portfolios_owner on public.portfolios;
create policy portfolios_owner on public.portfolios for all to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

do $$ declare table_name text; begin
  foreach table_name in array array['accounts','categories','recurring_rules','transactions'] loop
    execute format('drop policy if exists owner_access on public.%I', table_name);
    execute format('create policy owner_access on public.%I for all to authenticated using ((select public.owns_portfolio(portfolio_id))) with check ((select public.owns_portfolio(portfolio_id)))', table_name);
  end loop;
end $$;

drop policy if exists owner_access on public.transaction_items;
create policy owner_access on public.transaction_items for all to authenticated
using (exists(select 1 from public.transactions t where t.id = transaction_id and (select public.owns_portfolio(t.portfolio_id))))
with check (exists(select 1 from public.transactions t where t.id = transaction_id and (select public.owns_portfolio(t.portfolio_id))));

revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.portfolios, public.accounts, public.categories,
  public.recurring_rules, public.transactions, public.transaction_items to authenticated;

-- Atomically saves a transaction, its optional recurring rule, and all line items.
create or replace function public.save_finance_transaction(tx jsonb, items jsonb, rule jsonb default null)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if rule is not null then
    insert into public.recurring_rules(id, portfolio_id, account_id, type, amount, currency, category_id, description, day_of_month, starts_at, ends_at, is_active)
    values (rule->>'id', rule->>'portfolio_id', rule->>'account_id', rule->>'type', (rule->>'amount')::numeric,
      rule->>'currency', rule->>'category_id', coalesce(rule->>'description',''), (rule->>'day_of_month')::smallint,
      (rule->>'starts_at')::timestamptz, (rule->>'ends_at')::timestamptz, coalesce((rule->>'is_active')::boolean, true))
    on conflict (id) do update set account_id=excluded.account_id, type=excluded.type, amount=excluded.amount,
      currency=excluded.currency, category_id=excluded.category_id, description=excluded.description,
      day_of_month=excluded.day_of_month, starts_at=excluded.starts_at, ends_at=excluded.ends_at, is_active=excluded.is_active;
  end if;

  insert into public.transactions(id, portfolio_id, account_id, type, amount, currency, category_id, linked_account_id,
    principal_amount, interest_amount, description, occurred_at, source, recurring_rule_id, deleted_at)
  values (tx->>'id', tx->>'portfolio_id', tx->>'account_id', tx->>'type', (tx->>'amount')::numeric, tx->>'currency',
    nullif(tx->>'category_id',''), nullif(tx->>'linked_account_id',''), (tx->>'principal_amount')::numeric,
    (tx->>'interest_amount')::numeric, coalesce(tx->>'description',''), (tx->>'occurred_at')::timestamptz,
    tx->>'source', nullif(tx->>'recurring_rule_id',''), (tx->>'deleted_at')::timestamptz)
  on conflict (id) do update set account_id=excluded.account_id, type=excluded.type, amount=excluded.amount,
    currency=excluded.currency, category_id=excluded.category_id, linked_account_id=excluded.linked_account_id,
    principal_amount=excluded.principal_amount, interest_amount=excluded.interest_amount, description=excluded.description,
    occurred_at=excluded.occurred_at, source=excluded.source, recurring_rule_id=excluded.recurring_rule_id, deleted_at=excluded.deleted_at;

  delete from public.transaction_items where transaction_id = tx->>'id';
  insert into public.transaction_items(id, transaction_id, name, amount, quantity, unit_price, category_id, confidence)
  select value->>'id', value->>'transaction_id', value->>'name', (value->>'amount')::numeric,
    (value->>'quantity')::numeric, (value->>'unit_price')::numeric, value->>'category_id', (value->>'confidence')::numeric
  from jsonb_array_elements(coalesce(items, '[]'::jsonb));
end;
$$;
revoke all on function public.save_finance_transaction(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_finance_transaction(jsonb, jsonb, jsonb) to authenticated;
