create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  base_currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  color text not null default '#94a3b8',
  icon text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  name text not null,
  type text not null check (type in ('cash', 'bank', 'card', 'savings', 'investment', 'crypto', 'debt', 'credit', 'mortgage', 'custom')),
  currency text not null,
  initial_balance numeric(18, 2) not null default 0,
  color text not null default '#7dd3fc',
  annual_interest_rate numeric(9, 4),
  interest_frequency text check (interest_frequency in ('daily', 'monthly')),
  interest_started_at timestamptz,
  interest_allocation_account_id uuid references public.accounts(id) on delete set null,
  loan_term_months integer check (loan_term_months is null or loan_term_months > 0),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  storage_path text,
  status text not null default 'uploaded' check (status in ('uploaded', 'parsed', 'confirmed', 'failed')),
  raw_text text,
  parsed_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  type text not null check (type in ('income', 'expense', 'debt_payment', 'interest_accrual', 'adjustment')),
  amount numeric(18, 2) not null check (amount >= 0),
  currency text not null,
  category_id uuid references public.categories(id) on delete set null,
  linked_account_id uuid references public.accounts(id) on delete restrict,
  principal_amount numeric(18, 2) check (principal_amount is null or principal_amount >= 0),
  interest_amount numeric(18, 2) check (interest_amount is null or interest_amount >= 0),
  description text not null default '',
  occurred_at timestamptz not null,
  source text not null default 'manual' check (source in ('manual', 'text_ai', 'receipt_ai', 'recurring', 'system')),
  receipt_id uuid references public.receipts(id) on delete set null,
  recurring_rule_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  name text not null,
  amount numeric(18, 2) not null check (amount >= 0),
  category_id uuid references public.categories(id) on delete set null,
  confidence numeric(4, 3) not null default 0,
  created_at timestamptz not null default now()
);

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  type text not null check (type in ('income', 'expense')),
  amount numeric(18, 2) not null check (amount >= 0),
  currency text not null,
  category_id uuid references public.categories(id) on delete set null,
  description text not null default '',
  frequency text not null default 'monthly' check (frequency in ('monthly')),
  day_of_month integer not null check (day_of_month between 1 and 31),
  starts_at timestamptz not null,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transactions
  add constraint transactions_recurring_rule_id_fkey
  foreign key (recurring_rule_id) references public.recurring_rules(id) on delete set null;

create table public.assistant_reports (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  period text not null,
  summary_payload jsonb not null,
  response_payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.portfolios enable row level security;
alter table public.categories enable row level security;
alter table public.accounts enable row level security;
alter table public.receipts enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.assistant_reports enable row level security;

create policy "Profiles are self-owned"
  on public.profiles for all
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Portfolios are self-owned"
  on public.portfolios for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Portfolio children are self-owned"
  on public.categories for all
  using (exists (
    select 1 from public.portfolios p
    where p.id = categories.portfolio_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.portfolios p
    where p.id = categories.portfolio_id and p.user_id = auth.uid()
  ));

create policy "Accounts are self-owned"
  on public.accounts for all
  using (exists (
    select 1 from public.portfolios p
    where p.id = accounts.portfolio_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.portfolios p
    where p.id = accounts.portfolio_id and p.user_id = auth.uid()
  ));

create policy "Receipts are self-owned"
  on public.receipts for all
  using (exists (
    select 1 from public.portfolios p
    where p.id = receipts.portfolio_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.portfolios p
    where p.id = receipts.portfolio_id and p.user_id = auth.uid()
  ));

create policy "Transactions are self-owned"
  on public.transactions for all
  using (exists (
    select 1 from public.portfolios p
    where p.id = transactions.portfolio_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.portfolios p
    where p.id = transactions.portfolio_id and p.user_id = auth.uid()
  ));

create policy "Transaction items are self-owned"
  on public.transaction_items for all
  using (exists (
    select 1
    from public.transactions t
    join public.portfolios p on p.id = t.portfolio_id
    where t.id = transaction_items.transaction_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1
    from public.transactions t
    join public.portfolios p on p.id = t.portfolio_id
    where t.id = transaction_items.transaction_id and p.user_id = auth.uid()
  ));

create policy "Recurring rules are self-owned"
  on public.recurring_rules for all
  using (exists (
    select 1 from public.portfolios p
    where p.id = recurring_rules.portfolio_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.portfolios p
    where p.id = recurring_rules.portfolio_id and p.user_id = auth.uid()
  ));

create policy "Assistant reports are self-owned"
  on public.assistant_reports for all
  using (exists (
    select 1 from public.portfolios p
    where p.id = assistant_reports.portfolio_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.portfolios p
    where p.id = assistant_reports.portfolio_id and p.user_id = auth.uid()
  ));
