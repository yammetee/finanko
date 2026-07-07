# AGENTS.md

Guidance for coding agents working on Finanko.

## Product

Finanko is a minimal personal finance dashboard for tracking portfolios, accounts, income, expenses, savings, recurring payments, debts, receipts, and lightweight AI-assisted analysis.

The product should feel calm, thin, elegant, and practical. It is a financial cockpit, not a marketing site.

## Stack Direction

- Use Vite, React, and TypeScript.
- Use Ant Design for default UI components.
- Use Supabase for authentication, database, storage, and future edge functions.
- Keep the app web-first, but avoid browser-only assumptions where possible so it can later be wrapped with Tauri.
- Prefer small, local abstractions over framework-heavy architecture.

## Architecture

Organize features by domain:

```txt
src/
  app/
  features/
    auth/
    portfolios/
    accounts/
    transactions/
    recurring/
    analytics/
    receipts/
    assistant/
  shared/
    api/
    ui/
    lib/
    types/
```

Portfolios are the root business entity. Most records should belong to a `portfolio_id`.

Transactions are the source of financial history. Do not update balances in a way that loses the underlying event trail.

## Design

- Dark theme is the default.
- Use Ant Design components first and customize lightly through tokens.
- Keep visual noise low: subtle borders, compact spacing, restrained accent colors.
- Desktop should use sidebar-style navigation where appropriate.
- Mobile should favor bottom navigation, drawers, and compact forms.
- Do not build landing pages unless explicitly requested. The first screen should be the actual app experience.

## Data And AI

- AI calls must be minimal and scoped.
- Receipt parsing should send only the receipt image or OCR text plus needed category context.
- Text expense parsing should send only the user text and relevant category list.
- Portfolio assistant requests should use local summaries and aggregates instead of raw multi-year transaction history.
- During early MVP development, use mock AI responses behind the same interface planned for real AI calls.

## Safety

- Treat financial data as sensitive.
- Prefer soft deletion for financial records where practical.
- Destructive actions must require user confirmation.
- Portfolio deletion should require explicit confirmation, ideally by typing the portfolio name.
- The assistant must not provide regulated financial advice. It may describe observations, scenarios, tradeoffs, and approximate outcomes.

## Development

- Read existing code before changing patterns.
- Keep changes scoped to the requested behavior.
- Prefer `rg` for searching.
- Add tests when changing shared logic, calculations, analytics, or data transformations.
- Before finishing, run the relevant typecheck, lint, and tests when available.
