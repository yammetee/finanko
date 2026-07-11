create table if not exists public.finance_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_finance_snapshots_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists finance_snapshots_set_updated_at on public.finance_snapshots;

create trigger finance_snapshots_set_updated_at
before update on public.finance_snapshots
for each row
execute function public.set_finance_snapshots_updated_at();

alter table public.finance_snapshots enable row level security;

drop policy if exists "finance snapshots select own" on public.finance_snapshots;
create policy "finance snapshots select own"
on public.finance_snapshots
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "finance snapshots insert own" on public.finance_snapshots;
create policy "finance snapshots insert own"
on public.finance_snapshots
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "finance snapshots update own" on public.finance_snapshots;
create policy "finance snapshots update own"
on public.finance_snapshots
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "finance snapshots delete own" on public.finance_snapshots;
create policy "finance snapshots delete own"
on public.finance_snapshots
for delete
to authenticated
using (auth.uid() = user_id);
