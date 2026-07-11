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
- Zustand state with Supabase snapshot persistence
- Supabase Auth when `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set

The app is web-first, with architecture kept friendly for a future Tauri wrapper.

The app stores each authenticated user's finance state in `public.finance_snapshots` as a compact JSON snapshot, which keeps the current MVP backend small while syncing across devices.

Create the Supabase table and RLS policies from [supabase/finance_snapshots.sql](./supabase/finance_snapshots.sql) before using cloud persistence.

Currency conversion loads live rates directly from `https://open.er-api.com/v6/latest/USD`. The bundled rates file is only a fallback when the live API is unavailable.

AI parser and assistant features are wired through `/api/ai/parse` and `/api/ai/assistant`. Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` in `.env` to use real AI responses. Text parsing has a local deterministic fallback; receipt parsing fails explicitly when the receipt cannot be recognized reliably.

## Documentation

- [Technical specification](./TZ.md)
- [Accounting remediation plan](./ACCOUNTING_REMEDIATION_PLAN.md)
- [Agent instructions](./AGENTS.md)
