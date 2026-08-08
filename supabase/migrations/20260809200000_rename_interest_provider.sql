update finanko_private.capital_events
set external_provider = 'evenkvit_interest'
where external_provider = 'finanko_interest';
