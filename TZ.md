# Finanko Technical Specification

## 1. Goal

Build a calm, mobile-first tracker for actual personal expenses.

The primary flow is:

```txt
Open → Receipt / Text / Manual → Editable draft → Save → Updated totals
```

The product must answer:

- how much was spent in the selected period;
- how much was spent in selected categories;
- which saved expenses contribute to that result.

## 2. Active scope

- Email/password authentication.
- Manual expense entry.
- Text-assisted expense entry.
- Receipt-assisted expense entry with line items.
- Editable drafts and non-blocking analyzer warnings.
- Expense categories.
- Soft deletion and editing.
- Today, week, month, year, all-time, and custom date filters.
- Single- and multi-category filters.
- Converted display totals for supported currencies.
- Spending trend, category breakdown, and matching history.
- Russian and English UI.

Not in active scope:

- visible portfolios, accounts, wallets, or balances;
- income, debt, credit, interest, transfers, or recurring operations;
- net worth and cash-flow accounting;
- planned category limits or forecasts;
- portfolio assistant or financial recommendations.

## 3. Mobile-first UX

After authentication, `Receipt`, `Text`, and `Manual` must be visible without scrolling.

- Receipt launches the camera/image picker in one action.
- Text opens an autofocus input in one action.
- Manual opens the compact expense form in one action.
- Mobile input uses a full-screen sheet with a reachable primary action.
- Controls have at least 44×44 px touch targets.
- No active flow asks for a portfolio, account, transaction type, debt split, or recurrence.
- Desktop preserves the same mental model instead of restoring the old dashboard.

Page hierarchy:

1. Input method.
2. Filtered spending total.
3. Period and category filters.
4. Trend and category breakdown.
5. Matching expense history.

## 4. Analyzer contract

Receipt and text analyzers are suggestion providers.

- Their current algorithms, prompts, image preparation, normalization, and response contracts are protected from this UI refactor.
- A successful result populates an editable draft.
- A partial or failed result leaves a manual draft available.
- `requiresReview`, confidence, arithmetic mismatch, subtotal mismatch, and total mismatch are informational.
- Item totals are not required to equal the saved expense total.
- Only invalid required fields or persistence failures may block saving.

## 5. Spending calculations

- With no category filter, the saved expense total is authoritative.
- For receipts, category breakdown uses recognized/saved line items.
- The difference between saved total and item sum is shown as `Unallocated` and may be negative.
- For expenses without items, the full amount belongs to the main category.
- With category filters, history shows each expense's contribution to the selected categories.
- Displayed history contributions must sum to the displayed `Spent` total.
- Period boundaries use one local-timezone policy for filtering and presentation.

## 6. Data compatibility and safety

Existing saved expenses must not be automatically updated, recreated, or deleted.

Canonical compatibility tables:

```txt
portfolios            hidden ownership root retained for RLS/FKs
accounts              hidden technical relation retained for FKs
categories            active expense categories
transactions          active expense records plus preserved legacy rows
transaction_items     active receipt items
recurring_rules       retained database compatibility only
```

The active client loads all rows allowed by owner-scoped RLS, then exposes only non-deleted expense transactions from non-deleted portfolios. It does not generate recurring or interest records.

Schema cleanup requires a separate approved migration, a verified backup, ID/aggregate comparison, and proof that no real expense depends on removed relations.

## 7. Architecture

```txt
src/
  app/
  features/
    auth/
    expenses/
    finance/       compatibility repository/store
    receipts/      protected analyzer boundary
  shared/
    api/
    data/
    i18n/
    lib/
    types/
    ui/
api/
  ai.ts            authenticated parser endpoint
supabase/
  schema.sql       compatibility schema and RLS
```

Rules:

- Presentation owns temporary input/filter state.
- Pure expense analytics owns date/category contribution rules.
- The finance repository owns Supabase row mapping and persistence.
- Zustand is only a post-confirmation in-memory cache.
- Database writes complete before local state changes.
- Receipt/text algorithm code is not duplicated in UI components.

## 8. Validation

Required automated checks:

- analyzer regression tests remain unchanged and pass;
- mismatched item totals save through the expense consumer;
- date and category filters share one result set;
- deleted/non-expense/foreign records are excluded;
- unallocated receipt differences reconcile overall totals;
- `npm test`, `npm run build`, and `npm run lint` pass.

Required responsive checks:

- widths 320, 360, 390, and 430 px;
- one-action launch for all input modes;
- keyboard focus and safe-area behavior;
- loading, parse warning, persistence error, empty, and offline states;
- accessible labels, focus order, contrast, and touch targets.
