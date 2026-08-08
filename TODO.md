# Finanko development plan

## Current state

- [x] The expense flow is usable and remains the product's primary workflow.
- [x] Every expense position is stored independently with its own amount, currency, and category.
- [x] The capital model and its boundary from expenses have been agreed.
- [x] Implement capital tracking without regressing or coupling the expense flow.
- [x] The debt MVP and its boundaries from expenses and capital have been agreed.
- [ ] Implement debt tracking for fixed-rate annuity consumer loans and mortgages.

## Non-negotiable boundaries

- Expenses and capital are independent domains.
- Adding, editing, or deleting an expense never changes capital.
- Adding, editing, or deleting a capital event never changes expenses.
- Expense forms never ask for a capital group, item, or cash source.
- Capital forms never create expense records.
- Expense period and category filters never affect capital values.
- Capital failures, stale quotes, or background synchronization never block expense entry.
- Debts are independent from both expenses and capital.
- Adding, editing, paying, or deleting a debt never creates or changes an expense or capital event.
- Expense and capital operations never change a debt balance or payment schedule.
- Debt failures never block expense entry or capital tracking.
- Only neutral UI primitives, formatting helpers, and infrastructure may be shared across the domains.

## Agreed capital model

### User data

```text
capital_groups
  -> capital_items
       -> capital_events
```

`capital_groups` are user-defined containers. A name such as `TBC Broker`, `Portfolio 1`, or `Crypto` has no effect on calculations.

`capital_items` are independent positions inside a group. Stocks, funds, crypto, deposits, and cash are all items. The same market instrument in two groups is represented by two different items with independent events and cost bases.

`capital_events` are the source of truth. Current quantity, balance, average cost, profit/loss, and income are derived rather than manually persisted as authoritative totals.

### Technical data

```text
capital_snapshots
capital_item_quotes
```

These are rebuildable caches or normalized provider data, not additional user-facing financial entities.

### Event types

- `buy`
- `sell`
- `deposit`
- `withdrawal`
- `transfer`
- `dividend`
- `interest`
- `staking`
- `fee`
- `tax`
- `split`
- `adjustment`

An event may reference a related capital item. This supports a purchase funded from a cash item, a dividend credited to a cash item, and a transfer between two capital items without creating duplicated events. These relationships exist only inside capital.

### Automated event lifecycle

- `expected`: discovered or calculated automatically and excluded from confirmed balances.
- `confirmed`: reviewed by the user and included in calculations.
- `ignored`: explicitly rejected and excluded from calculations.

Before confirmation, the user can edit the amount, quantity, date, tax, destination cash item, and other relevant fields. Provider identifiers make automatic creation idempotent. Manual corrections are never silently overwritten by later synchronization.

## Calculation policy

### Cost basis

Use weighted-average cost for the first implementation:

```text
average cost = remaining cost basis / remaining quantity
```

- A purchase increases quantity and cost basis; its fee is included in cost basis.
- A partial sale removes cost basis at the current weighted average.
- A sale fee reduces proceeds.
- A transfer carries quantity and proportional cost basis without realizing profit or loss.
- A split changes quantity and unit cost while preserving total cost basis.
- A dividend or cash interest does not change the source item's average cost.
- Original events remain available so another lot method can be added later without migrating transaction history.

### Performance

```text
unrealized P/L = current market value - remaining cost basis
realized P/L = sale proceeds - removed cost basis - sale fees
net income = confirmed dividends + confirmed interest - withheld taxes
total result = unrealized P/L + realized P/L + net income
```

Deposits, withdrawals, and transfers are cash flows, not profit or loss.

### Currency

Keep these concepts separate:

- Item quote currency.
- Event currency.
- Reporting currency, initially USD.

Historical calculations use the FX rate for the event or valuation date. Current totals use the latest available FX rate. Expense currency behavior remains unchanged and independent.

### Precision

- Store money, prices, quantities, rates, and percentages as Postgres `numeric` values.
- Transport precision-sensitive values as decimal strings.
- Use decimal arithmetic in the client and server; do not use binary floating-point as the accounting source of truth.
- Support fractional shares and high-precision crypto quantities.

## Stage 1: Database contract

- [x] Add owner-scoped capital groups, items, and events.
- [x] Keep capital tables private and expose only narrowly scoped authenticated RPCs or server endpoints.
- [x] Add direct owner checks to every read and write path.
- [x] Add constraints for event types, statuses, positive quantities, currencies, and valid related-item ownership.
- [x] Add indexes for owner/group, owner/item, event date, status, and external provider identifiers.
- [x] Add a unique idempotency constraint for automatically discovered events.
- [x] Add private owner-scoped quote and snapshot caches; remove unused global market cache tables.
- [x] Update schema tests to prove ownership isolation, grants, and atomic writes.
- [x] Keep the local schema repeatable and reviewable before any separately authorized remote application.

Exit condition: the schema represents groups, independent items, linked capital-only events, and private technical caches without any reference to `expenses` or `categories`.

## Stage 2: Capital domain and calculations

- [x] Add capital domain types independent from expense types.
- [x] Implement event replay in chronological order with deterministic tie-breaking.
- [x] Calculate quantity, remaining cost basis, weighted average, current value, realized P/L, unrealized P/L, net income, and total result.
- [x] Implement cash items using the same item model.
- [x] Implement related-item effects for buys, sales, dividends, interest, and transfers.
- [x] Implement splits without changing total cost basis.
- [x] Implement USD conversion with dated event FX and current valuation FX rates.
- [x] Add decimal-safe arithmetic at every accounting, aggregation, FX, and serialization boundary; convert to numbers only for formatting and chart coordinates.
- [x] Expand focused calculation coverage across aggregation, FX, deletion, provider failures, interest, fractional quantities, and split cases.

Exit condition: every displayed capital number can be rebuilt deterministically from confirmed events and market data.

## Stage 3: Persistence and state

- [x] Add a capital repository separate from the expense repository.
- [x] Add a capital Zustand store separate from the expense store.
- [x] Load groups, items, events, pending events, latest persisted quotes, and valuations into normalized state.
- [x] Save linked events and physical group deletion atomically.
- [x] Support create, edit, permanent delete, confirm, ignore, and safe correction workflows.
- [x] Keep expected events out of confirmed balances and performance.
- [x] Load capital independently after authentication.
- [x] Ensure capital load or save errors never block the expense page.

Exit condition: capital can operate end-to-end using manual data while expenses remain unchanged.

## Stage 4: Market identity and providers

- [x] Identify securities with a stable provider asset ID selected through search while keeping manual ticker entry available before save.
- [x] Identify listed crypto with an editable stable provider coin ID rather than ticker alone.
- [x] Store a primary and fallback price source on each market item.
- [x] Implement normalized provider adapters so vendor response shapes never enter domain or UI code.
- [x] Use Bybit and CoinGecko for crypto, no-key Nasdaq and Yahoo market data for US stocks/funds, and the existing FX source.
- [x] Batch unique instruments across user items to avoid repeated provider calls.
- [x] Cache normalized prices with provider and retrieval timestamp.
- [x] Fall back to the secondary provider, then the last known quote, then an explicit manual price.
- [x] Show stale-price state instead of failing the capital page.
- [x] Keep integrations keyless where possible; market providers currently require no user credentials.

Exit condition: every supported item can resolve a stable market identity and current value without depending on the name of its group.

## Stage 5: Automatic income and corporate actions

- [ ] Automatic dividends and splits are intentionally excluded while they require paid provider endpoints; both remain available as manual editable events.
- [x] Support interest rules with rate, effective date, cadence, compounding policy, tax, and destination item.
- [x] Preserve historical interest events when a future rate changes.
- [x] Support staking income as quantity plus fair value at receipt.
- [x] Prevent repeated interest generation from duplicating expected or confirmed events. Provider dividend/split idempotency uses the same stored external identifiers but remains to be connected.

Exit condition: calculated interest arrives as an editable expected event and affects capital only after confirmation. Dividends, staking, and splits remain editable manual events while free reliable automation is unavailable.

## Stage 6: Shared UI foundation

- [x] Move the application header out of the expense page without changing its appearance or behavior.
- [x] Keep expense-specific rows, forms, filters, analytics, and state inside the expense feature.
- [x] Reuse existing dark theme, spacing, typography, controls, and responsive breakpoints.
- [x] Avoid adding a routing dependency unless navigation requirements make it necessary.

Exit condition: expenses look and behave the same, while capital can use the same visual language without importing expense-domain components.

## Stage 7: Navigation

- [x] Keep the expense page unchanged as an independent primary workflow.
- [x] Put `Expenses` and `Capital` tabs in the shared header between the brand and account actions.
- [x] Remove the duplicated capital card and navigation button from the expense page.
- [x] Keep expense display-currency controls scoped to the expense tab.
- [x] Keep capital loading isolated from expense rendering.

Exit condition: both independent domains are directly reachable from the shared header without duplicated navigation or data coupling.

## Stage 8: Capital page

- [x] Reuse the current page width, header, panels, rows, controls, and mobile layout.
- [x] Show current capital in USD as the headline metric.
- [x] Show invested amount, absolute result, and confirmed net income without requiring percentages.
- [x] Add a line chart for all available stored capital history with no date filter.
- [x] Label the graph as capital dynamics rather than investment return because deposits also change the line.
- [x] Show a group filter only when more than one group exists.
- [x] Add one type filter: `All`, `Stocks and funds`, `Crypto`, `Cash and deposits`.
- [x] Do not add filters for date, provider, currency, income type, or performance until a real use case requires them.
- [x] Show each item independently with quantity, average cost, current price, value, absolute P/L, and confirmed income.
- [x] Keep unavailable market prices visible as a per-item stale-price state without page-level explanatory banners.

Exit condition: the capital page is useful on mobile and desktop with no unnecessary controls.

## Stage 9: Capital editing flows

- [x] Add and rename a group.
- [x] Add an item by provider search or manual definition.
- [x] Let provider data prefill user-facing item fields while keeping them editable before the first save.
- [x] Add manual buy, sell, deposit, withdrawal, transfer, dividend, interest, staking, fee, tax, split, and adjustment events.
- [x] Add a fast opening-position flow using quantity and total invested amount, saved atomically with the new item.
- [x] Edit or permanently delete an incorrect event without destroying unrelated history.
- [x] Permanently delete groups, items, and events with explicit confirmation.
- [x] Confirm, edit, or ignore expected events in the same visual form pattern.
- [x] Never introduce capital controls into expense entry forms.

Exit condition: all capital state can be created and corrected manually even when every provider is unavailable.

## Stage 10: History and snapshots

- [x] Fetch available historical prices when a market-backed item is added through the configured provider.
- [x] Build historical values from events, dated quotes, and the latest bundled FX rate available on each valuation date.
- [x] Record or refresh daily derived snapshots for efficient graph loading.
- [x] Make snapshots rebuildable after a backdated edit, deletion, split, or provider correction.
- [x] Start manual assets at their first confirmed event when no earlier market history exists.
- [x] Keep raw events and quotes authoritative over derived snapshots.

Exit condition: the all-history line graph can be rebuilt from authoritative events, quotes, and available dated FX data after backdated changes.

## Stage 11: Security, validation, and cleanup

- [x] Test unauthenticated access and cross-user read/write protections.
- [x] Test idempotent automatic interest generation and database uniqueness during concurrent confirmation.
- [x] Test provider failures, malformed responses, rate limits, stale data, and fallback behavior.
- [x] Test decimal precision across database-scale values and capital calculations.
- [x] Test that capital failures cannot block receipt, text, or manual expense entry.
- [ ] Visually verify the capital route on supported mobile and desktop viewports.
- [x] Complete full tests, build, lint, and diff validation after the current capital slice.
- [x] Complete the final search for duplicated implementations, stale documentation, unused exports, and replaced legacy code.
- [ ] Apply remote schema changes only after separate explicit authorization and a reviewed deployment order.

Exit condition: all checks pass, the two domains remain independent, and only one active implementation exists for each behavior.

## Agreed debt MVP

### Product boundary

Debt is a third independent domain:

```text
debt_groups
  -> debts
       -> debt_payments
```

- A debt group is only a user-defined container and never affects calculations.
- A debt represents one loan with its own currency, balance, fixed annual rate, payment dates, and repayment policy.
- Every payment is an independent immutable financial event that can be corrected or permanently deleted.
- The debt schedule and projections are derived from the debt terms and payment events rather than stored as authoritative user data.
- Recording a debt payment does not create an expense. Recording an expense does not pay a debt.
- Recording a debt payment does not withdraw money from capital. Capital and debt remain independent even when this requires manual entry in both domains.

### Supported loans

The first version supports only:

- fixed-rate annuity consumer loans;
- fixed-rate annuity mortgages;
- scheduled payments;
- partial early repayment with either term reduction or payment reduction;
- full early repayment.

The first version explicitly excludes:

- credit cards and revolving credit;
- grace periods;
- floating or manually changing rates;
- overdue-payment penalties;
- payment holidays and restructuring;
- insurance premiums and unrelated bank fees;
- refinancing and consolidation;
- automatic bank synchronization.

### Required debt terms

An existing loan requires the minimum data needed to project its schedule:

- name and group;
- lender name for display only;
- loan type: consumer loan or mortgage;
- currency;
- current principal balance;
- fixed annual interest rate;
- current required annuity payment;
- next payment date;
- remaining payment count or contractual end date;
- balance effective date used as the interest-calculation anchor.

The form derives the missing remaining term or end date when one can be calculated safely. It does not request original principal, historical payments, or already-paid interest unless the user chooses to import them later.

### Payment and interest policy

- Interest accrues on the outstanding principal for the actual number of calendar days between calculation anchors.
- The denominator follows the actual number of days in each calendar year, splitting an interval at the year boundary when required.
- A payment first covers accrued interest and then reduces principal.
- Any amount above the required scheduled payment is treated as early principal repayment after accrued interest is covered.
- A full payoff amount equals outstanding principal plus interest accrued through the selected payoff date.
- Money, rates, payment splits, and schedule calculations use decimal arithmetic and Postgres `numeric`, never binary floating point as the source of truth.
- The implementation must be reconciled against at least one real Sberbank schedule before claiming bank-level parity.
- Differences caused by contract-specific rounding or bank corrections must be repairable with an explicit balance reconciliation, never by silently rewriting past payments.

### Sberbank early-repayment policy

- `Reduce term`: keep the required annuity payment and derive the smaller remaining payment count, with a smaller final payment when necessary.
- `Reduce payment`: keep the remaining payment count and recalculate the required payment from the reduced principal using the Sberbank contract formula verified during implementation.
- `Close fully`: calculate and record principal plus accrued interest for the chosen date, then mark the debt closed.
- Early repayment must preserve the original payment history and create a new projected schedule from the repayment date.
- Before confirmation, show the resulting principal balance, required payment, remaining term, and projected interest savings.

## Stage 12: Debt calculation specification

- [x] Document the exact annuity, daily-interest, rounding, scheduled-payment, and payoff formulas used by the debt domain.
- [x] Verify the Sberbank early-repayment formulas against current official lending terms.
- [x] Define deterministic ordering for multiple payments or corrections on the same date.
- [x] Define how leap years, month-end dates, short first periods, and adjusted final payments are handled.
- [x] Define the balance-reconciliation event used when the bank schedule differs from the projection.
- [ ] Prepare real reference scenarios covering an ordinary payment, early repayment with term reduction, early repayment with payment reduction, and full payoff.

Exit condition: the calculation contract is explicit enough that the same inputs always produce the same balance and schedule, and reference scenarios match the verified Sberbank figures within the bank's rounding precision.

## Stage 13: Debt database contract

- [x] Add owner-scoped debt groups, debts, and debt payments without references to expense or capital tables.
- [x] Store principal, rates, payment amounts, interest portions, principal portions, and calculated values as Postgres `numeric` transported as decimal strings.
- [x] Add constraints for currencies, supported loan types, fixed positive rates, positive balances, payment strategies, statuses, and valid dates.
- [x] Add owner/group, owner/debt, payment-date, and idempotency indexes.
- [x] Keep debt tables private and expose only narrow authenticated RPCs with explicit expected-owner checks.
- [x] Make debt, opening terms, and first derived schedule persistence atomic.
- [x] Make payment creation, schedule recalculation, and debt closure atomic.
- [x] Make permanent group, debt, and payment deletion preserve unrelated records and invalidate only affected derived projections.
- [x] Add repeatable migration coverage for empty and existing databases before producing the remote SQL handoff.

Exit condition: the database can persist and isolate debts and payments without any cross-domain foreign keys or side effects.

## Stage 14: Debt domain engine

- [x] Add debt types and decimal-safe calculation helpers independent from expense and capital types.
- [x] Calculate daily accrued interest across arbitrary payment dates and calendar-year boundaries.
- [x] Split every payment into interest, scheduled principal, and early principal.
- [x] Generate the remaining annuity schedule from the current loan state.
- [x] Recalculate the schedule after early repayment with term reduction.
- [x] Recalculate the schedule after early repayment with payment reduction.
- [x] Calculate an exact payoff quote for a selected date.
- [x] Calculate current principal, accrued interest, next payment, remaining term, future interest, total remaining cost, and interest saved by early payments.
- [x] Support explicit reconciliation without changing historical payment events.
- [x] Keep closed debts in history while excluding them from active totals and upcoming-payment amounts.

Exit condition: every displayed debt value and projection can be rebuilt deterministically from debt terms and payment events.

## Stage 15: Debt persistence and state

- [x] Add a debt repository separate from expense and capital repositories.
- [x] Add a debt Zustand store separate from expense and capital stores.
- [x] Load debt groups, debts, payments, and derived projections only for the authenticated owner.
- [x] Reset and reload debt state safely on account changes without exposing another user's state.
- [x] Support create, edit, permanent delete, payment, reconciliation, early-repayment preview, confirmation, and full closure workflows.
- [ ] Invalidate and rebuild only the affected debt schedule after backdated corrections.
- [x] Ensure debt load, calculation, or save failures never block expenses or capital.

Exit condition: the full debt workflow operates independently using manual data and survives reloads and account changes.

## Stage 16: Shared navigation and debt page

- [x] Add `Debts` as the third shared-header tab beside `Expenses` and `Capital` without changing either existing page.
- [x] Keep the shared currency and account actions positioned exactly as they are now.
- [x] Reuse the expense page structure and existing classes exactly: summary, quick actions, filters, analytics grid, detail page, forms, and rows.
- [x] Do not add debt-specific layout CSS when an existing expense or capital primitive has matching semantics.
- [x] Show total active principal converted to USD as the headline metric.
- [x] Show required payments, accrued interest, and projected remaining interest as compact secondary metrics.
- [x] Add the same three quick actions: group, debt, and payment.
- [x] Add only useful filters: group, active/closed status, and consumer loan/mortgage type when more than one value exists.
- [x] Show a debt-balance line graph and a matching distribution panel by group.
- [x] Show every debt independently in its native currency with balance, annual rate, required payment, and next payment date.
- [x] Open a debt detail page by pressing its row; keep edit and permanent delete inside the detail page.

Exit condition: the debt page has the same density, positioning, components, and responsive behavior as the working expense and capital pages.

## Stage 17: Debt editing flows

- [x] Add and rename a debt group.
- [x] Add an existing debt through the minimum required terms without unnecessary optional fields.
- [x] Add a payment by choosing a debt, amount, and date.
- [x] For an ordinary payment, preview the interest/principal split before save.
- [x] For an oversized payment, offer only `Reduce term`, `Reduce payment`, or `Close fully` as applicable.
- [x] Preview the new payment, new payoff date, remaining interest, and interest savings before confirming early repayment.
- [x] Edit or permanently delete an incorrect payment and deterministically rebuild the affected schedule.
- [x] Reconcile the calculated principal with the bank's displayed principal through an explicit correction flow.
- [x] Prevent invalid actions such as payments after closure, negative principal, or an early payment smaller than accrued interest without inventing additional blockers.

Exit condition: a user can enter an existing loan, record ordinary and early payments, and keep the projection aligned with the bank without editing database records manually.

## Stage 18: Real verification and cleanup

- [ ] Apply the debt migration to a disposable PostgreSQL/Supabase environment and exercise every RPC through the production repository contract.
- [ ] Verify owner isolation, logout/login state reset, physical deletion, atomic payment recording, and rollback on invalid schedules.
- [ ] Reconcile the calculation engine against real Sberbank schedule examples for ordinary, partial, and full repayment.
- [ ] Exercise group creation, debt creation, ordinary payment, both early-repayment strategies, editing, deletion, closure, reload, and account switching through the rendered application.
- [ ] Verify the debt route at supported iPhone and desktop widths without layout overlap or focus zoom.
- [ ] Confirm expense and capital behavior remains unchanged and no debt mutation reaches their stores or tables.
- [ ] Remove replaced code, temporary adapters, unused styles, unused translations, dead exports, stale TODO statements, and duplicated calculation paths.
- [ ] Run lint, type checks, production build, database integration checks, real route smoke checks, and diff validation.
- [ ] Hand off remote migration and deployment steps only after the local and disposable-environment gates pass.

Exit condition: the debt MVP works through real UI and database paths, matches the verified bank scenarios, leaves expenses and capital independent, and contains no parallel legacy implementation.

## Stage 19: Shared chart redesign after debt MVP

- [x] Replace the custom `SpendingChart` SVG with Recharts; do not continue developing the handwritten chart.
- [x] Use one shared Recharts chart implementation for expenses, capital, and debts.
- [x] Improve line interpolation, area treatment, grid density, axis labels, point emphasis, hover/touch tooltips, empty/single-point states, and responsive scaling.
- [x] Preserve the existing dark theme, analytics-panel layout, locale-aware labels, currency formatting, keyboard accessibility, and reduced-motion behavior.
- [x] Remove the replaced custom SVG code, styles, and adapters after the Recharts replacement is verified.
- [ ] Visually verify real datasets at supported iPhone and desktop widths rather than relying on source inspection or unit tests.

Exit condition: all three product tabs use one polished, responsive, and accessible chart implementation with no legacy chart path.
