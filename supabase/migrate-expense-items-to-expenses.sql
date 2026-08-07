-- REVIEW BEFORE EXECUTION.
-- Converts every legacy expense_items row into an independent expense, removes
-- the duplicated parent receipt/text expense, and then removes expense_items.
-- Run this once, then apply schema.sql before deploying the matching client.

begin;

alter table public.expenses
  drop constraint if exists expenses_amount_check;
alter table public.expenses
  add constraint expenses_amount_check check (amount <> 0);

do $$
begin
  if exists (
    select 1
    from public.expense_items as item
    join public.expenses as existing on existing.id = item.id
  ) then
    raise exception 'Cannot migrate: an expense_items ID already exists in expenses';
  end if;
end;
$$;

insert into public.expenses (
  id,
  owner_id,
  amount,
  currency,
  category_id,
  description,
  occurred_at,
  source,
  deleted_at,
  created_at,
  updated_at
)
select
  item.id,
  item.owner_id,
  item.amount,
  parent.currency,
  item.category_id,
  item.name,
  parent.occurred_at,
  parent.source,
  parent.deleted_at,
  item.created_at,
  now()
from public.expense_items as item
join public.expenses as parent
  on parent.id = item.expense_id
 and parent.owner_id = item.owner_id;

delete from public.expenses as parent
where exists (
  select 1
  from public.expense_items as item
  where item.expense_id = parent.id
    and item.owner_id = parent.owner_id
);

drop table public.expense_items;
drop function if exists public.save_expense(jsonb, jsonb);

commit;
