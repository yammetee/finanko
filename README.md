# Finanko

Finanko is a minimal, mobile-first expense tracker. It is designed for one fast loop: open the app, choose receipt, text, or manual input, review an editable draft, and save the expense.

## Product

- Receipt input opens the camera or image picker immediately.
- Text input focuses the expense field immediately.
- Every input mode produces editable positions with their own amount, currency, and category.
- Receipt and text analyzers prepare suggestions; warnings never block saving.
- The editable draft is the source of truth when an expense is saved.
- Period and category filters drive the total, category breakdown, trend, and history together.
- Mobile is the primary layout; desktop uses the same interaction model with more space.

Finanko tracks actual spending only. Unrelated financial product areas are outside its scope.

## Stack

- Vite, React, and TypeScript
- Ant Design
- Zustand for the in-memory view cache
- Supabase Auth and Postgres
- Vercel Function for authenticated text and receipt parsing

## Data model

The runtime uses two browser-accessible tables: `categories` and `expenses`. Every reviewed position is saved as its own expense row with its own amount, currency, and category. The multi-position total exists only as a converted preview and is never persisted. A printed or AI-provided receipt total never creates or changes a saved position, and non-product receipt rows are not expenses. Every row carries its authenticated owner directly, and Postgres RLS enforces that ownership. Zustand is only an in-memory cache after confirmed database writes.

AI administrator roles and daily usage counters live in the non-exposed `finanko_private` schema. The authenticated quota RPC is the only browser-role entry point to that data.

## Analyzer boundary

The receipt and text recognition algorithms are intentionally isolated in `src/features/receipts` and the parse branch of `api/ai.ts`.

- Do not change their prompts, OCR/image processing, normalization, or response contracts as part of UI work.
- A parser result only fills a draft.
- Arithmetic mismatches, low confidence, and review warnings are informational.
- The values visible in each position at save time are persisted as independent expenses, even when they differ from analyzer output.

## AI access policy

Text and receipt recognition share one server-enforced allowance. Regular users can make up to five AI requests per UTC day; administrators are unrestricted. Text requests are accepted only for concrete money-related input and are rejected before model execution when they contain links, credential requests, phishing language, prompt-injection language, unsupported fields, or oversized content.

Apply [supabase/schema.sql](./supabase/schema.sql) before deploying matching application changes. After registering the administrator account, assign its role from the Supabase SQL editor (replace the placeholder email):

```sql
insert into finanko_private.user_roles (user_id, role)
select id, 'admin'
from auth.users
where email = 'admin@example.com'
on conflict (user_id) do update set role = excluded.role, updated_at = now();
```

Users without a `user_roles` row remain regular users. The browser has no direct read or write access to roles or quota rows.

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
git diff --check
```

Supabase authentication requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. AI credentials stay server-side in Vercel environment variables.
