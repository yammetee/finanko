# Finanko

Minimal personal finance dashboard for tracking portfolios, accounts, income, expenses, savings, recurring payments, debts, receipts, and lightweight AI-assisted analysis.

## Concept

Finanko is designed as a calm financial cockpit:

- multiple portfolios;
- dynamic accounts and savings sources;
- manual income and expense tracking;
- monthly recurring payments;
- week, month, and year analytics;
- receipt and text-based expense parsing;
- portfolio assistant based on compact financial summaries.

## Stack

- Vite
- React
- TypeScript
- Ant Design
- Zustand in-memory UI state backed by relational Supabase tables
- Supabase Auth when `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set

The app is web-first, with architecture kept friendly for a future Tauri wrapper.

All financial records live in normalized Supabase tables (`portfolios`, `accounts`, `categories`, `transactions`, `transaction_items`, and `recurring_rules`). Zustand is only an in-memory view cache and is never used for persistence.

Apply [supabase/schema.sql](./supabase/schema.sql) before running the app. It creates constraints, indexes, explicit Data API grants, and owner-scoped RLS policies. If the former `finance_snapshots` table exists, the script migrates its records and removes the legacy table.

Currency conversion loads live rates directly from `https://open.er-api.com/v6/latest/USD`. The bundled rates file is only a fallback when the live API is unavailable.

AI parser and assistant features run in the authenticated Vercel Function at [api/ai.ts](./api/ai.ts). Keep `OPENAI_API_KEY`, optional `OPENAI_BASE_URL`, and `OPENAI_MODEL` in Vercel Environment Variables. The browser sends the current Supabase access token, and the function validates it before making a paid AI request. Text parsing keeps a deterministic fallback; receipt parsing fails explicitly when recognition is unreliable.

## Documentation

- [Technical specification](./TZ.md)
- [Accounting remediation plan](./ACCOUNTING_REMEDIATION_PLAN.md)
- [Agent instructions](./AGENTS.md)
