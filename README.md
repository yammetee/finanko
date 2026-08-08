# evenkvit

evenkvit is a mobile-first personal finance application.

The product has three independent areas:

- Expenses: receipt, text, or manual input; editable expense positions; analytics and history.
- Capital: independently maintained groups, assets, cash positions, operations, market values, and income.
- Debts: independently maintained loan groups, balances, payments, interest, and early-repayment projections.

Expenses, capital, and debts share top-level navigation, but they never share records or automatically change one another.

The current application uses Vite, React, TypeScript, Ant Design, Zustand, Supabase Auth/Postgres, and Vercel Functions.

The active development plan is maintained in [TODO.md](./TODO.md).

## Development

```bash
npm install
npm run dev
```

## Validation

```bash
npm test
npm run build
npm run lint
git diff --check
```
