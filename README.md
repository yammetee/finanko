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

Finanko tracks actual spending only. Unrelated financial product areas are outside its scope.

## Stack

- Vite, React, and TypeScript
- Ant Design
- Zustand for the in-memory view cache
- Supabase Auth and Postgres
- Vercel Function for authenticated text and receipt parsing

## Data model

The runtime uses three browser-accessible tables: `categories`, `expenses`, and `expense_items`. Every row carries its authenticated owner directly, and Postgres RLS enforces that ownership. Zustand is only an in-memory cache after confirmed database writes.

AI administrator roles and daily usage counters live in the non-exposed `finanko_private` schema. The authenticated quota RPC is the only browser-role entry point to that data.

### Destructive reset and rebuild

The current project can be rebuilt without creating another Supabase project:

1. Back up the database and review [supabase/reset-public-schema.sql](./supabase/reset-public-schema.sql).
2. Run that reset SQL in the Supabase SQL editor. It drops the Finanko-owned `finanko_private` schema and non-extension-owned objects in `public` only.
3. Inspect the reset notices, then run [supabase/schema.sql](./supabase/schema.sql) to create the minimal Finanko schema.
4. Register the administrator account and assign its role with the SQL below.

The reset does not target Supabase-managed `auth`, `storage`, `extensions`, `realtime`, `vault`, GraphQL, Functions, or migration schemas. It is intentionally review-only in this repository and is never run by application code.

## Analyzer boundary

The receipt and text recognition algorithms are intentionally isolated in `src/features/receipts` and the parse branch of `api/ai.ts`.

- Do not change their prompts, OCR/image processing, normalization, or response contracts as part of UI work.
- A parser result only fills a draft.
- Arithmetic mismatches, low confidence, and review warnings are informational.
- The values visible in the editor at save time are persisted, even when they differ from analyzer output.

## AI access policy

Text and receipt recognition share one server-enforced allowance. Regular users can make up to five AI requests per UTC day; administrators are unrestricted. Text requests are accepted only for concrete money-related input and are rejected before model execution when they contain links, credential requests, phishing language, prompt-injection language, unsupported fields, or oversized content.

Apply [supabase/schema.sql](./supabase/schema.sql) before deploying the matching API code. After registering the administrator account, assign its role from the Supabase SQL editor (replace the placeholder email):

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
