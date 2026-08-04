# Finanko

Finanko is a minimal, mobile-first expense tracker. It is designed for one fast loop: open the app, choose receipt, text, or manual input, review an editable draft, and save the expense.

## Product

- Receipt input opens the camera or image picker immediately.
- Text input focuses the expense field immediately.
- Manual input asks only for amount, category, description, date, and currency.
- Receipt and text analyzers prepare suggestions; warnings never block saving.
- The editable draft is the source of truth when an expense is saved.
- Period and category filters drive the total, category breakdown, trend, and history together.
- Mobile is the primary layout; desktop uses the same interaction model with more space.

Finanko tracks actual spending. Planned limits, account balances, portfolios, income, debt, recurring operations, net worth, and financial advice are not part of the active product.

## Stack

- Vite, React, and TypeScript
- Ant Design
- Zustand for the in-memory view cache
- Supabase Auth and Postgres
- Vercel Function for authenticated text and receipt parsing

## Data compatibility

Existing expenses are real user data and must not be rewritten or deleted during the product refactor.

The runtime continues to read `transactions`, `transaction_items`, and `categories`. Legacy `portfolio_id` and `account_id` relations remain as hidden storage compatibility fields, so the existing Supabase tables and foreign keys must stay in place until a separately verified data migration is approved. New users receive one internal portfolio/account context that never appears in the UI.

Financial rows use owner-scoped RLS through their portfolio relationship. Zustand is never used for persistence. Applying [supabase/schema.sql](./supabase/schema.sql) creates the relational schema, grants, constraints, indexes, and policies required by the current compatibility layer.

Before and after rollout, run [supabase/expense-baseline.sql](./supabase/expense-baseline.sql) in an authenticated user session and compare counts, per-currency totals, category counts, date bounds, expense fields, and receipt-item fields. The script is read-only; do not substitute a reset or data-rewriting migration.

## Analyzer boundary

The receipt and text recognition algorithms are intentionally isolated in `src/features/receipts` and the parse branch of `api/ai.ts`.

- Do not change their prompts, OCR/image processing, normalization, or response contracts as part of UI work.
- A parser result only fills a draft.
- Arithmetic mismatches, low confidence, and review warnings are informational.
- The values visible in the editor at save time are persisted, even when they differ from analyzer output.

## Development

```bash
npm install
npm run dev
```

Required checks:

```bash
npm test
npm run build
npm run lint
```

Supabase authentication requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. AI credentials stay server-side in Vercel environment variables.

## Documentation

- [Current technical specification](./TZ.md)
- [Expense tracker refactor TODO](./EXPENSE_TRACKER_REFACTOR_TODO.md)
- [Agent instructions](./AGENTS.md)
