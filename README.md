# evenkvit

evenkvit is a mobile-first personal finance application.

The product has three independent areas:

- Expenses: receipt, text, or manual input; editable expense positions; analytics and history.
- Capital: independently maintained groups, assets, cash positions, operations, market values, and income.
- Debts: independently maintained loan groups, balances, payments, interest, and early-repayment projections.

Expenses, capital, and debts share top-level navigation, but they never share records or automatically change one another.

The current application uses Vite, React, TypeScript, Ant Design, Zustand, Supabase Auth/Postgres, and Vercel Functions.

Account deletion is performed by the server through Supabase Auth Admin and requires a server-only `SUPABASE_SECRET_KEY`. Never expose this variable through Vite or a `NEXT_PUBLIC_*` name.

## Development

```bash
npm install
npm run dev
```

## Validation

```bash
npm run build
npm run lint
git diff --check
```
