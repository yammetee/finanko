-- One-time cleanup of replaced capital storage formats.
drop table if exists finanko_private.market_actions;
drop table if exists finanko_private.market_quotes;
alter table finanko_private.capital_snapshots drop column if exists payload;
alter table finanko_private.capital_events drop column if exists notes;

alter table finanko_private.capital_events drop constraint if exists capital_events_required_values_check;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'finanko_private' and table_name = 'capital_events' and column_name = 'unit_price') then
    execute 'update finanko_private.capital_events set amount = quantity * unit_price where amount is null and unit_price is not null';
    execute 'alter table finanko_private.capital_events drop column unit_price';
  end if;
end $$;
alter table finanko_private.capital_events add constraint capital_events_required_values_check check (
  (event_type in ('buy', 'sell', 'staking') and quantity > 0 and amount > 0)
  or (event_type in ('deposit', 'withdrawal', 'transfer') and (quantity > 0 or amount > 0))
  or (event_type in ('dividend', 'interest', 'fee', 'tax') and amount > 0)
  or (event_type = 'split' and split_ratio > 0)
  or (event_type = 'adjustment' and (quantity <> 0 or amount <> 0))
);
