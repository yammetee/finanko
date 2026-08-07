# Finanko agent handoff

## Product

Finanko is a compact, mobile-first personal expense tracker. The active flow is:

`Receipt / Text / Manual -> editable expense draft -> save -> filtered total, chart, categories, and history`.

Use Vite, React, TypeScript, Ant Design, Zustand, Supabase Auth/Postgres, and the existing Vercel AI endpoint. The default UI is dark, minimal, compact, and responsive. Do not add portfolios, accounts, balances, debt, recurring operations, an assistant, a landing page, sidebars, drawers, or unrelated product areas.

## Current user-authorized task

Continue from the existing uncommitted worktree. The user must not have to restate these requirements.

1. Remove every repository artifact unrelated to the current Finanko product, especially Yammetee remnants and completed migration/refactor documentation.
2. Remove inactive account, portfolio, loan, debt, income, interest, recurring, assistant, and legacy migration runtime branches. Retain only compatibility that is demonstrably required by the active expense persistence path, and isolate any unavoidable compatibility fields from product types/UI.
3. Finish server-enforced AI access control:
   - database-managed `admin` role;
   - administrators have unlimited AI recognition;
   - regular users have at most five user-initiated AI recognition requests per UTC day;
   - quota consumption must be atomic in Postgres;
   - text AI accepts only concrete expense/money input and rejects phishing, credentials, URLs, prompt injection, unsupported modes/fields, and oversized input before model execution;
   - legitimate short expense text in Russian, English, Georgian, and Thai must reach AI;
   - every receipt image prepared by the browser client must reach AI unless authentication/quota/size checks reject it.
4. Produce a minimal Supabase schema containing only tables and functions required by the current Finanko runtime, with owner-scoped RLS and private AI role/quota storage.
5. The user explicitly requests an SQL reset/rebuild workflow for the current Supabase project because it contains unrelated Yammetee tables and project limits prevent creating another Supabase project. Treat this as a destructive operation: resolve the exact affected schemas, distinguish `public` application objects from Supabase-managed `auth`, Storage, extensions, and migration schemas, and present the exact reset/rebuild SQL for review before any execution. Never execute it remotely without a separate explicit execution request.
6. Run `npm test`, `npm run build`, `npm run lint`, and `git diff --check` after cleanup.

## Current worktree state

- Do not discard or reset any existing uncommitted changes.
- AI quota/role enforcement is implemented in `api/ai.ts` and `supabase/schema.sql` with regression tests.
- Incomplete-period average calculation is fixed in the uncommitted expense analytics changes.
- The text parser is expense-only and has been validated after removing account/loan output.
- `TZ.md`, `EXPENSE_TRACKER_REFACTOR_TODO.md`, `LICENSE` containing the Yammetee copyright, and the obsolete `scripts/apply-supabase-schema.mjs` were deleted as unrelated legacy artifacts.
- The finance compatibility runtime and empty legacy feature directories were removed. Expense persistence now uses direct owner-scoped `categories`, `expenses`, and `expense_items` tables.
- The user reports that `supabase/reset-public-schema.sql` and then `supabase/schema.sql` were successfully executed in the current Supabase project. Do not repeat the destructive reset unless separately and explicitly requested.
- Supabase sign-up now consumes an immediately returned session when email confirmation is disabled, or prompts the user to confirm email and then sign in when confirmation is required. Authentication errors are localized from stable error codes instead of exposing provider messages.
- Russian user-facing instructions and errors consistently use the formal `Вы` form.
- Recognized text and receipts remain itemized. Their review UI shows shared currency and date plus editable item names and prices, while duplicate parent amount, category, and description controls stay hidden and are derived from the items on save.
- Every explicitly priced product remains a separate categorized item; drinking water is normalized to Food even if AI labels it Health.
- Native currency mode keeps source currencies in totals and history instead of presenting them as USD; single-currency analytics stay available, while mixed-currency charts require choosing one conversion currency.
- The unused legacy `shortDate` formatter, duplicate client-side receipt total recovery module, stale chart chunk rule, dead translation entries, redundant CSS selector, and unused export surface were removed; recovery tests now exercise the canonical server implementation.
- `npm test` (74 tests), `npm run build`, `npm run lint`, and `git diff --check` pass after the item-review, water-category, and native-currency fixes.

## Working rules

- Read the current diff and trace imports before deleting more code.
- Use `rg` for repository searches and `apply_patch` for edits/deletions.
- Preserve the receipt image preparation and receipt normalization behavior unless a change is required by the current explicit task.
- AI output only prepares an editable draft; current form values remain the source of truth when saving.
- Keep AI credentials server-side and user role/quota tables inaccessible directly from browser roles.
- Maintain an English pending commit message covering the entire diff against `HEAD`.
