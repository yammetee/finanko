# Finanko development plan

## Current state

- [x] The expense flow is usable and remains the product's primary workflow.
- [x] Every expense position is stored independently with its own amount, currency, and category.
- [x] The capital model and its boundary from expenses have been agreed.
- [x] Implement capital tracking without regressing or coupling the expense flow.

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

- [x] Identify securities with an editable provider asset ID. Exchange/MIC support remains.
- [x] Identify listed crypto with an editable stable provider coin ID rather than ticker alone.
- [ ] Identify tokens with chain and contract address.
- [x] Store a primary and fallback price source on each item.
- [ ] Store an independent income/corporate-action source when needed.
- [x] Implement normalized provider adapters so vendor response shapes never enter domain or UI code.
- [x] Use Bybit and CoinGecko for crypto, no-key Nasdaq market data for US stocks/funds, and the existing FX source.
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

Exit condition: dividends, interest, staking, and splits arrive as editable expected events and affect capital only after confirmation.

## Stage 6: Shared UI foundation

- [x] Move the application header out of the expense page without changing its appearance or behavior.
- [ ] Extract only genuinely neutral summary, panel, button, loading, and error primitives.
- [ ] Generalize the existing line-chart foundation while preserving the expense chart output.
- [x] Keep expense-specific rows, forms, filters, analytics, and state inside the expense feature.
- [x] Reuse existing dark theme, spacing, typography, controls, and responsive breakpoints.
- [x] Avoid adding a routing dependency unless navigation requirements make it necessary.

Exit condition: expenses look and behave the same, while capital can use the same visual language without importing expense-domain components.

## Stage 7: Home summary

- [x] Keep spending as the primary home workflow and retain all current expense controls.
- [x] Show spending for the selected expense period.
- [x] Show current total capital as a separate compact metric.
- [x] Make the capital metric open the capital page.
- [x] Do not show percentage change or detailed capital analytics on the home page.
- [x] Ensure expense period/category changes never alter the capital metric.
- [x] Render capital loading and unavailable states locally without disabling expense actions.
- [x] Stack the two metrics cleanly on small screens.

Exit condition: the home page shows independent spending and current-capital values without coupling their data flows.

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
- [x] Provide empty, loading, partial, stale, error, and retry states.

Exit condition: the capital page is useful on mobile and desktop with no unnecessary controls.

## Stage 9: Capital editing flows

- [x] Add and rename a group.
- [x] Add an item by provider search or manual definition.
- [x] Let provider data prefill an item while keeping every field editable before save.
- [x] Add manual buy, sell, deposit, withdrawal, transfer, dividend, interest, staking, fee, tax, split, and adjustment events.
- [x] Add a fast opening-position flow using quantity and total invested amount, saved atomically with the new item.
- [x] Edit or void an incorrect event without destroying unrelated history.
- [x] Archive and restore closed items and groups without deleting their events.
- [x] Confirm, edit, or ignore expected events in the same visual form pattern.
- [x] Never introduce capital controls into expense entry forms.

Exit condition: all capital state can be created and corrected manually even when every provider is unavailable.

## Stage 10: History and snapshots

- [x] Fetch available historical prices when a market-backed item is added through the configured provider.
- [x] Build historical values from events, dated quotes, and dated FX rates.
- [x] Record or refresh daily derived snapshots for efficient graph loading.
- [x] Make snapshots rebuildable after a backdated edit, deletion, split, or provider correction.
- [x] Start manual assets at their first confirmed event when no earlier market history exists.
- [x] Keep raw events and quotes authoritative over derived snapshots.

Exit condition: the all-history line graph remains correct after backdated operations and corporate actions.

## Stage 11: Security, validation, and cleanup

- [x] Test unauthenticated access and cross-user read/write protections.
- [x] Test idempotent automatic interest generation and database uniqueness during concurrent confirmation.
- [x] Test provider failures, malformed responses, rate limits, stale data, and fallback behavior.
- [x] Test decimal precision across database-scale values and capital calculations.
- [x] Test that capital failures cannot block receipt, text, or manual expense entry.
- [x] Verify responsive layouts and accessibility states on supported viewports.
- [x] Run `npm test` after the current development slice.
- [x] Run `npm run build` after the current development slice.
- [x] Run `npm run lint` after the current development slice.
- [x] Run `git diff --check` after the current development slice.
- [x] Search the current slice for duplicated implementations, stale documentation, unused exports, and replaced legacy code.
- [ ] Apply remote schema changes only after separate explicit authorization and a reviewed deployment order.

Exit condition: all checks pass, the two domains remain independent, and only one active implementation exists for each behavior.
