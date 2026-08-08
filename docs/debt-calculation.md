# Debt calculation contract

This contract applies only to fixed-rate annuity consumer loans and mortgages in the independent debt domain.

## Stored inputs

- Opening state: principal balance, balance date, annual rate, required payment, next payment date, and remaining payment count.
- User events: payment or explicit principal reconciliation.
- Events are ordered by `occurred_at`, then persisted `event_sequence`, then id.
- All authoritative amounts are decimal strings in the client and `numeric(38,18)` in PostgreSQL. Money is rounded half-up to two decimals at each payment boundary.

## Interest

Interest accrues on outstanding principal from the previous calculation anchor up to the event date:

```text
interest = principal × annual_rate × actual_days / days_in_calendar_year
```

An interval crossing 1 January is split by calendar year, so each segment uses 365 or 366 as its own denominator. Dates are UTC calendar dates. Monthly payment dates retain the contractual day where possible and clamp to the last day of shorter months.

## Payments

An ordinary payment is allocated in this order:

1. accrued interest;
2. scheduled principal;
3. principal paid early.

A payment cannot be negative, exceed the payoff amount, or leave accrued interest unpaid. A payment that clears the balance must explicitly use `full`.

The payoff amount on a selected date is:

```text
outstanding principal + interest accrued through the payoff date
```

The last contractual payment is adjusted to clear the remaining principal and interest after decimal rounding.

## Partial early repayment

The implementation follows section 3.10.4 of [Sberbank's general mortgage terms](https://help.domclick.ru/documents/1854/mortgage_base.pdf):

- `reduce_term`: keep the required payment and derive the smaller payment count;
- `reduce_payment`: keep the payment count and calculate the new payment proportionally:

```text
payment_after = principal_after / principal_before × payment_before
```

Here `principal_before` and `principal_after` are the balances immediately before and after the early-principal portion of the event. The following schedule starts from the early-repayment date without rewriting prior events.

## Reconciliation

A reconciliation is a separate dated event that replaces the calculated principal from that point forward. It never edits prior payments. All later payment splits and projections are rebuilt from the reconciled balance.
