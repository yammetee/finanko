-- Read-only baseline for verifying real expense history before and after client refactors.
-- Run through an authenticated database session so auth.uid() resolves to the target user.
-- This file intentionally performs no writes and creates no database objects.

with owned_expenses as (
  select t.*
  from public.transactions t
  where t.type = 'expense'
    and t.deleted_at is null
    and (select public.owns_portfolio(t.portfolio_id))
)
select
  count(*) as expense_count,
  min(occurred_at) as first_occurred_at,
  max(occurred_at) as last_occurred_at
from owned_expenses;

with owned_expenses as (
  select t.*
  from public.transactions t
  where t.type = 'expense'
    and t.deleted_at is null
    and (select public.owns_portfolio(t.portfolio_id))
)
select currency, count(*) as expense_count, sum(amount) as expense_total
from owned_expenses
group by currency
order by currency;

with owned_expenses as (
  select t.*
  from public.transactions t
  where t.type = 'expense'
    and t.deleted_at is null
    and (select public.owns_portfolio(t.portfolio_id))
)
select category_id, count(*) as expense_count
from owned_expenses
group by category_id
order by category_id;

with owned_expenses as (
  select t.*
  from public.transactions t
  where t.type = 'expense'
    and t.deleted_at is null
    and (select public.owns_portfolio(t.portfolio_id))
)
select count(*) as receipt_item_count
from public.transaction_items i
join owned_expenses e on e.id = i.transaction_id;

with owned_expenses as (
  select t.id
  from public.transactions t
  where t.type = 'expense'
    and t.deleted_at is null
    and (select public.owns_portfolio(t.portfolio_id))
)
select
  id,
  portfolio_id,
  account_id,
  amount,
  currency,
  category_id,
  description,
  occurred_at,
  source
from owned_expenses
order by id;

with owned_expenses as (
  select t.id
  from public.transactions t
  where t.type = 'expense'
    and t.deleted_at is null
    and (select public.owns_portfolio(t.portfolio_id))
)
select
  i.id,
  i.transaction_id,
  i.name,
  i.amount,
  i.quantity,
  i.unit_price,
  i.category_id,
  i.confidence
from public.transaction_items i
join owned_expenses e on e.id = i.transaction_id
order by i.transaction_id, i.id;
