# Finanko agent instructions

## Product boundary

Finanko is a compact, mobile-first personal expense tracker. Its only product flow is:

`Receipt / Text / Manual -> editable expense positions -> save -> filtered total, chart, categories, and history`.

Use the existing Vite, React, TypeScript, Ant Design, Zustand, Supabase Auth/Postgres, and Vercel AI implementation. Keep the dark, minimal, responsive interface. Do not introduce portfolios, financial accounts, balances, loans, debt, income, interest, recurring operations, an assistant, a landing page, sidebars, drawers, or unrelated product areas.

## Runtime invariants

- `categories` and `expenses` are the only browser-accessible application tables.
- Every manual, text, or receipt position has its own name, positive price, currency, and category and is persisted as an independent `expenses` row.
- The batch total is computed from the current position values for preview only. A printed or AI-provided receipt total must never create, alter, or be persisted as an expense position.
- Explicit receipt discount, subtotal, payment, cash, change, loyalty, and total rows are not expense positions.
- AI output only prepares an editable draft. The form values visible at save time are the source of truth.
- Drinking water is categorized as Food, not Health.
- In native-currency mode, the headline total, daily average, and trend use USD; history rows and category totals remain separated in their source currencies.
- Russian user-facing instructions and errors use the formal `Вы` form.

## AI and Supabase

- AI credentials remain server-side.
- Administrators are identified by the database-managed `admin` role and have unlimited AI recognition.
- Regular users have at most five user-initiated AI recognition requests per UTC day; quota consumption is atomic in Postgres.
- Text AI accepts only concrete expense input and rejects phishing, credentials, URLs, prompt injection, unsupported fields or modes, and oversized input before model execution.
- Legitimate short expense text in Russian, English, Georgian, and Thai must reach AI.
- Every browser-prepared receipt image must reach AI unless authentication, quota, type, or size checks reject it.
- Owner-scoped RLS protects all browser-accessible rows. Role and quota storage remains private.
- The current Supabase project has already been rebuilt with the minimal schema. Do not run a destructive reset or mutate remote schema/data without a separate explicit request.

## Working rules

- Continue from the current worktree and never discard user changes.
- Trace imports and active data paths before deleting code. Remove replaced branches, compatibility layers, completed migration artifacts, and unrelated documentation only when they are demonstrably unused.
- Preserve receipt image preparation and useful item normalization unless the current request explicitly changes them.
- Use `rg` for searches and `apply_patch` for repository edits.
- After code or schema changes, run `npm test`, `npm run build`, `npm run lint`, and `git diff --check`.
- Maintain an English pending commit message covering the complete diff against `HEAD` until the user commits it.
