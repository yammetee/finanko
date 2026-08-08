# Finanko development plan

## Current state

- [x] The expense flow is usable and remains the product's primary workflow.
- [x] Every expense position is stored independently with its own amount, currency, and category.
- [x] The capital model and its boundary from expenses have been agreed.
- [ ] Implement capital tracking without regressing or coupling the expense flow.

## Non-negotiable boundaries

- Expenses and capital are independent domains.
- Adding, editing, or deleting an expense never changes capital.
- Adding, editing, or deleting a capital event never changes expenses.
- Expense forms never ask for a capital group, item, or cash source.
- Capital forms never create expense records.
- The home page may display expense and capital summaries together, but this is presentation-only composition.
- Expense period and category filters never affect capital values.
- Capital failures, stale quotes, or background synchronization never block expense entry.
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
market_quotes
market_actions
capital_snapshots
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

- [ ] Add owner-scoped capital groups, items, and events.
- [ ] Keep capital tables private and expose only narrowly scoped authenticated RPCs or server endpoints.
- [ ] Add direct owner checks to every read and write path.
- [ ] Add constraints for event types, statuses, positive quantities, currencies, and valid related-item ownership.
- [ ] Add indexes for owner/group, owner/item, event date, status, and external provider identifiers.
- [ ] Add a unique idempotency constraint for automatically discovered events.
- [ ] Add private normalized quote, market-action, and snapshot caches.
- [ ] Update schema tests to prove ownership isolation, grants, and atomic writes.
- [ ] Keep the local schema repeatable and reviewable before any separately authorized remote application.

Exit condition: the schema represents groups, independent items, linked capital-only events, and private technical caches without any reference to `expenses` or `categories`.

## Stage 2: Capital domain and calculations

- [ ] Add capital domain types independent from expense types.
- [ ] Implement event replay in chronological order with deterministic tie-breaking.
- [ ] Calculate quantity, remaining cost basis, weighted average, current value, realized P/L, unrealized P/L, net income, and total result.
- [ ] Implement cash items using the same item model.
- [ ] Implement related-item effects for buys, dividends, and transfers.
- [ ] Implement splits without changing total cost basis.
- [ ] Implement USD conversion with dated and current FX rates.
- [ ] Add decimal-safe arithmetic at every calculation and serialization boundary.
- [ ] Add focused tests for buys, partial sales, fees, taxes, dividends, interest, transfers, splits, FX, fractional shares, and backdated events.

Exit condition: every displayed capital number can be rebuilt deterministically from confirmed events and market data.

## Stage 3: Persistence and state

- [ ] Add a capital repository separate from the expense repository.
- [ ] Add a capital Zustand store separate from the expense store.
- [ ] Load groups, items, events, pending events, and latest quotes into a normalized snapshot.
- [ ] Save multi-row effects atomically where one user action affects related items.
- [ ] Support create, edit, archive, restore, confirm, ignore, and safe correction workflows.
- [ ] Keep expected events out of confirmed balances and performance.
- [ ] Load capital independently after authentication.
- [ ] Ensure capital load or save errors never block the expense page.

Exit condition: capital can operate end-to-end using manual data while expenses remain unchanged.

## Stage 4: Market identity and providers

- [ ] Identify securities with a provider asset ID plus exchange/MIC or another stable identifier when available.
- [ ] Identify listed crypto with a stable provider coin ID rather than ticker alone.
- [ ] Identify tokens with chain and contract address.
- [ ] Store a primary and fallback price source on each item.
- [ ] Store an independent income/corporate-action source when needed.
- [ ] Implement normalized provider adapters so vendor response shapes never enter domain or UI code.
- [ ] Start with a free-first provider set for US stocks/funds, crypto, and FX.
- [ ] Batch unique instruments across user items to avoid repeated provider calls.
- [ ] Cache normalized prices with provider and retrieval timestamp.
- [ ] Fall back to the secondary provider, then the last known quote, then an explicit manual price.
- [ ] Show stale-price state instead of failing the capital page.
- [ ] Keep provider credentials server-side and configure them only through a separately authorized secret operation.

Exit condition: every supported item can resolve a stable market identity and current value without depending on the name of its group.

## Stage 5: Automatic income and corporate actions

- [ ] Fetch declared dividends and stock/fund splits from provider data.
- [ ] Calculate dividend entitlement from confirmed quantity on the relevant record/ex-date.
- [ ] Apply the item's editable default withholding rate.
- [ ] Create one expected dividend event with gross, tax, net, and optional destination cash item.
- [ ] Let the user edit the event before confirmation.
- [ ] Apply a split only after confirmation and preserve cost basis.
- [ ] Support interest rules with rate, effective date, cadence, compounding policy, tax, and destination item.
- [ ] Preserve historical interest events when a future rate changes.
- [ ] Support staking income as quantity plus fair value at receipt.
- [ ] Prevent repeated scheduler runs from duplicating expected or confirmed events.

Exit condition: dividends, interest, staking, and splits arrive as editable expected events and affect capital only after confirmation.

## Stage 6: Shared UI foundation

- [ ] Move the application header out of the expense page without changing its appearance or behavior.
- [ ] Extract only genuinely neutral summary, panel, button, loading, and error primitives.
- [ ] Generalize the existing line-chart foundation while preserving the expense chart output.
- [ ] Keep expense-specific rows, forms, filters, analytics, and state inside the expense feature.
- [ ] Reuse existing dark theme, spacing, typography, controls, and responsive breakpoints.
- [ ] Avoid adding a routing dependency unless navigation requirements make it necessary.

Exit condition: expenses look and behave the same, while capital can use the same visual language without importing expense-domain components.

## Stage 7: Home summary

- [ ] Keep spending as the primary home workflow and retain all current expense controls.
- [ ] Show spending for the selected expense period.
- [ ] Show current total capital as a separate compact metric.
- [ ] Make the capital metric open the capital page.
- [ ] Do not show percentage change or detailed capital analytics on the home page.
- [ ] Ensure expense period/category changes never alter the capital metric.
- [ ] Render capital loading, unavailable, and stale states locally without disabling expense actions.
- [ ] Stack the two metrics cleanly on small screens.

Exit condition: the home page shows independent spending and current-capital values without coupling their data flows.

## Stage 8: Capital page

- [ ] Reuse the current page width, header, panels, rows, controls, and mobile layout.
- [ ] Show current capital in USD as the headline metric.
- [ ] Show invested amount, absolute result, and confirmed net income without requiring percentages.
- [ ] Add a line chart for all available capital history with no date filter.
- [ ] Label the graph as capital dynamics rather than investment return because deposits also change the line.
- [ ] Show a group filter only when more than one group exists.
- [ ] Add one type filter: `All`, `Stocks and funds`, `Crypto`, `Cash and deposits`.
- [ ] Do not add filters for date, provider, currency, income type, or performance until a real use case requires them.
- [ ] Show each item independently with quantity, average cost, current price, value, absolute P/L, and confirmed income.
- [ ] Provide empty, loading, partial, stale, error, and retry states.

Exit condition: the capital page is useful on mobile and desktop with no unnecessary controls.

## Stage 9: Capital editing flows

- [ ] Add and rename a group.
- [ ] Add an item by search or manual definition.
- [ ] Let provider data prefill an item while keeping every field editable before save.
- [ ] Add manual buy, sell, deposit, withdrawal, transfer, dividend, interest, fee, tax, split, and adjustment events.
- [ ] Add a fast opening-position flow using quantity and total invested amount.
- [ ] Edit or void an incorrect event without destroying unrelated history.
- [ ] Archive closed items and groups without deleting their events.
- [ ] Confirm, edit, or ignore automatic events in the same visual form pattern.
- [ ] Never introduce capital controls into expense entry forms.

Exit condition: all capital state can be created and corrected manually even when every provider is unavailable.

## Stage 10: History and snapshots

- [ ] Fetch available historical prices when a market-backed item is added.
- [ ] Build historical values from events, dated quotes, and dated FX rates.
- [ ] Record or refresh daily derived snapshots for efficient graph loading.
- [ ] Make snapshots rebuildable after a backdated edit, deletion, split, or provider correction.
- [ ] Start manual assets at their first confirmed event when no earlier market history exists.
- [ ] Keep raw events and quotes authoritative over derived snapshots.

Exit condition: the all-history line graph remains correct after backdated operations and corporate actions.

## Stage 11: Security, validation, and cleanup

- [ ] Test unauthenticated access and cross-user read/write attempts.
- [ ] Test idempotent automatic event generation and concurrent confirmation.
- [ ] Test provider timeouts, malformed responses, rate limits, stale data, and fallback behavior.
- [ ] Test decimal precision across database, API, store, and UI boundaries.
- [ ] Test that capital failures cannot block receipt, text, or manual expense entry.
- [ ] Verify responsive layouts and accessibility states on supported viewports.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run lint`.
- [ ] Run `git diff --check`.
- [ ] Search for duplicated implementations, stale documentation, unused exports, and replaced legacy code.
- [ ] Apply remote schema changes only after separate explicit authorization and a reviewed deployment order.

Exit condition: all checks pass, the two domains remain independent, and only one active implementation exists for each behavior.
