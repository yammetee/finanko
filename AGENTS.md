# AGENTS.md

Guidance for coding agents working on Finanko.

## Product

Finanko is a minimal, mobile-first tracker for actual personal expenses. Its primary flow is `Receipt / Text / Manual → editable draft → save → filtered spending total`.

The product should feel calm, thin, elegant, and practical. It is not an accounting cockpit, portfolio manager, or marketing site.

## Stack

- Use Vite, React, and TypeScript.
- Use Ant Design first and customize lightly through tokens/CSS.
- Use Supabase for authentication and relational persistence.
- Use Zustand only as an in-memory cache after confirmed database writes.
- Keep browser assumptions isolated so a later Tauri wrapper remains possible.

## Architecture

```txt
src/
  app/
  features/
    auth/
    expenses/
    finance/
    receipts/
  shared/
    api/
    data/
    i18n/
    lib/
    types/
    ui/
```

- `expenses` owns the active product UI and spending calculations.
- `finance` is a compatibility persistence layer for existing Supabase rows.
- `receipts` is the protected receipt/text analyzer boundary.
- Do not recreate ledger, balance, portfolio, account, debt, recurring, interest, or assistant UI.

## Protected behavior

- Do not change the current receipt recognition algorithm, prompts, image preparation, normalization, or response contract unless explicitly requested.
- Do not change the current text recognition algorithm or fallback unless explicitly requested.
- Analyzer output fills an editable draft and never blocks saving because of confidence or arithmetic mismatch.
- The current form values are the source of truth when saving.

## Data safety

- Existing expenses are real data. Never rewrite, normalize, recreate, reset, truncate, or mass-delete them.
- Preserve IDs, amounts, currencies, categories, dates, descriptions, sources, and receipt items.
- Keep legacy `portfolios` and `accounts` tables while real transactions reference them.
- Hide legacy portfolio/account relations from the UI and treat them only as storage compatibility fields.
- Prefer soft deletion for expenses.
- Destructive actions require explicit user confirmation.
- Keep owner-scoped RLS on every exposed financial table.

## Design

- Dark theme is the default.
- Mobile is the primary view; desktop preserves the same interaction model.
- Receipt, Text, and Manual actions must be visible immediately after authentication.
- Avoid sidebars, dense toolbars, nested navigation, and unnecessary confirmation steps.
- Use compact spacing, subtle borders, restrained color, clear labels, and 44×44 px touch targets.
- Filters for period and category must update totals, analytics, and history together.
- Do not build a landing page unless explicitly requested.

## AI and privacy

- Send only the selected receipt image or expense text plus required category/currency context.
- AI suggestions are not financial advice and do not make automated decisions.
- Keep AI credentials server-side.

## Development

- Read existing code before changing patterns.
- Prefer reuse of the current auth, repository, parsers, formatting, and i18n primitives.
- Keep changes scoped to actual-expense tracking.
- Use `rg` for searches.
- Add tests for shared calculations, filters, normalization boundaries, and data transformations.
- Run `npm test`, `npm run build`, and `npm run lint` before finishing.
