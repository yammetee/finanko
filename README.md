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

## Planned Stack

- Vite
- React
- TypeScript
- Ant Design
- Supabase Auth and Postgres
- Supabase Storage
- TanStack Query
- Recharts or Ant Design Charts

The app is web-first, with architecture kept friendly for a future Tauri wrapper.

The current MVP runs in local JSON mode by default. Supabase is kept as a future adapter and only turns on when `VITE_ENABLE_SUPABASE=true`.

Currency conversion is wired through the Vite local API proxy at `/api/exchange-rates`, which reads `EXCHANGE_RATES_URL` and defaults to `https://open.er-api.com/v6/latest/USD`. The bundled rates file is only a fallback when the live API is unavailable.

AI parser and assistant features are wired through `/api/ai/parse` and `/api/ai/assistant`. Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` in `.env` to use real AI responses; when AI is not configured or fails, the app keeps the MVP usable with local mock fallbacks. The default fallback model is the low-cost `gpt-5.4-nano`.

## Documentation

- [Technical specification](./TZ.md)
- [Agent instructions](./AGENTS.md)
