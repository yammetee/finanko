# Finanko Development Roadmap

This document is the technical assignment for building Finanko. It defines the order of implementation, scope boundaries, and acceptance criteria for each development stage.

## 0. Product Goal

Build a minimal, elegant personal finance dashboard where a user can:

- log in with Google;
- manage multiple portfolios;
- create dynamic accounts and savings sources;
- add income, expenses, and monthly recurring transactions;
- view transaction history;
- analyze week, month, and year periods;
- upload or type expenses for AI-assisted parsing;
- ask an assistant for portfolio observations based on compact summaries.

The MVP should be web-first with Vite + React + Supabase and should remain friendly for a future Tauri wrapper.

## 1. Technical Stack

Use:

- Vite
- React
- TypeScript
- Ant Design
- Supabase Auth
- Supabase Postgres
- Supabase Storage for future receipt uploads
- TanStack Query
- Zustand only for lightweight UI state if needed
- Recharts or Ant Design Charts

Do not use Next.js for the MVP.

## 2. Development Principles

- Dark theme by default.
- Use Ant Design components first and customize lightly.
- Keep the interface minimal, thin, and focused on financial information.
- Build responsive layouts from the beginning.
- Treat portfolios as the root business entity.
- Treat transactions as the source of financial history.
- Use mock AI services in MVP, but keep the interface compatible with real AI calls later.
- Avoid sending raw long-term transaction history to AI. Build local summaries first.
- Destructive actions require confirmation.
- Prefer soft deletion for financial records.

## 3. Target Project Structure

```txt
src/
  app/
    providers/
    router/
    theme/
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

## 4. Milestone 1: App Scaffold

### Goal

Create the initial Vite React app foundation.

### Tasks

- Initialize Vite + React + TypeScript.
- Install Ant Design.
- Install routing, data, and chart dependencies.
- Add app providers.
- Add dark Ant Design theme tokens.
- Add base layout shell.
- Add responsive layout primitives for desktop and mobile.
- Add environment variable structure for Supabase.

### Acceptance Criteria

- App starts locally with `npm run dev`.
- TypeScript compiles.
- Dark theme is applied globally.
- The first screen is an app shell or auth screen, not a landing page.
- Layout works at desktop and mobile widths.

## 5. Milestone 2: Supabase Foundation

### Goal

Add the database and authentication foundation.

### Tasks

- Add Supabase client.
- Add Google auth flow.
- Add auth session provider.
- Add protected routes.
- Add SQL migrations or schema files for core tables.
- Add row-level security policies.

### Tables

Implement at minimum:

```txt
profiles
portfolios
accounts
categories
transactions
transaction_items
recurring_rules
receipts
assistant_reports
```

### Acceptance Criteria

- User can log in with Google.
- User can log out.
- Protected app screens are not available without auth.
- Database schema supports the MVP entities.
- RLS prevents users from accessing other users' data.

## 6. Milestone 3: Portfolios

### Goal

Allow a user to manage multiple financial portfolios.

### Tasks

- Create portfolio list/query.
- Create portfolio switcher.
- Create portfolio creation flow.
- Store active portfolio in local UI state.
- Add portfolio deletion flow.
- Require explicit confirmation before deleting a portfolio.

### Acceptance Criteria

- User can create more than one portfolio.
- User can switch the active portfolio.
- All portfolio-scoped screens use the active portfolio.
- User can delete a portfolio only after confirmation.
- Deleted portfolio data is excluded from normal app views.

## 7. Milestone 4: Accounts And Savings Sources

### Goal

Allow the user to create dynamic places where money is stored or tracked.

### Tasks

- Build accounts list.
- Build account creation form.
- Support account types:
  - cash
  - bank
  - card
  - savings
  - investment
  - crypto
  - debt
  - custom
- Support account currency.
- Support initial balance.
- Support archive or soft delete.

### Acceptance Criteria

- User can create a custom account with name, type, amount, and currency.
- User can see account balances.
- User can archive or delete an account with confirmation.
- Account data is scoped to the active portfolio.

## 8. Milestone 5: Manual Transactions

### Goal

Allow the user to add and manage income and expenses manually.

### Tasks

- Build transaction creation drawer/modal.
- Support transaction types:
  - income
  - expense
  - adjustment
- Fields:
  - account
  - amount
  - currency
  - category
  - date
  - description
- Build transaction history table/list.
- Add transaction deletion with confirmation.
- Recalculate or derive account balances from transaction history.

### Acceptance Criteria

- User can add income.
- User can add expense.
- User can choose account, category, date, amount, and currency.
- Transaction appears in history.
- Deleting a transaction removes it from analytics and balance calculations.
- History is scoped to the active portfolio.

## 9. Milestone 6: Monthly Recurring Transactions

### Goal

Allow the user to mark income or expenses as monthly recurring.

### Tasks

- Add recurring checkbox to transaction form.
- Create `recurring_rules` from recurring transactions.
- Generate due recurring transactions when a portfolio is opened or dashboard loads.
- Prevent duplicate generated transactions for the same rule and period.
- Show recurring source in transaction history.

### Acceptance Criteria

- User can create a monthly recurring expense.
- Due recurring transactions are generated with correct `occurred_at`.
- Analytics count recurring transactions only when their generated transaction date is inside the selected period.
- Duplicate recurring transactions are not generated for the same month.

## 10. Milestone 7: Analytics Dashboard

### Goal

Build the main dashboard for week, calendar month, and year analytics.

### Tasks

- Add timeframe segmented control:
  - week
  - month
  - year
- Default timeframe: current calendar month.
- Calculate period boundaries locally.
- Query transactions by `occurred_at`.
- Build summary metrics:
  - income for period
  - expenses for period
  - net flow
  - current total balance
- Build charts:
  - income vs expenses trend
  - expenses by category
  - account balances
- Show recent transactions.

### Acceptance Criteria

- Dashboard defaults to the current calendar month.
- Week analytics include only transactions inside that calendar week.
- Month analytics include only transactions inside that calendar month.
- Year analytics include only transactions inside that calendar year.
- A rent or recurring payment outside the selected period is not counted.
- Current balance and period movement are visually separated.

## 11. Milestone 8: Text Expense Parser Mock

### Goal

Allow the user to type expenses in natural language and receive structured suggestions.

### Tasks

- Add transaction input mode switch:
  - manual
  - text
  - receipt
- Build text parser UI.
- Implement mock parser service.
- Return suggested items, amounts, and categories.
- Let user edit suggestions before saving.
- Save confirmed suggestions as transaction and optional transaction items.

### Acceptance Criteria

- User can type a text expense.
- App returns structured mock suggestions.
- User can edit amount/category before saving.
- Saving creates normal transaction records.
- Parser implementation can later be replaced with a real AI call.

## 12. Milestone 9: Receipt Parser Mock

### Goal

Allow the user to upload or photograph a receipt and receive structured suggestions.

### Tasks

- Build receipt upload UI.
- Store local mock receipt state.
- Implement mock receipt parser.
- Return suggested items, total, categories, and confidence.
- Let user edit suggestions before saving.
- Prepare Supabase Storage integration interface for later.

### Acceptance Criteria

- User can select a receipt file.
- App returns mock parsed line items.
- User can confirm or edit parsed items.
- Confirmed receipt creates transaction and transaction items.
- Future real parser can reuse the same interface.

## 13. Milestone 10: Portfolio Assistant Mock

### Goal

Add an assistant that analyzes compact portfolio summaries.

### Tasks

- Build local summary generator.
- Summarize:
  - period income
  - period expenses
  - top categories
  - recurring payments
  - account balances
  - unusual or high categories
- Build assistant panel.
- Implement mock assistant response.
- Keep response non-advisory.

### Acceptance Criteria

- Assistant does not receive raw multi-year transaction lists.
- Assistant uses local aggregate summaries.
- Assistant gives observations, scenarios, tradeoffs, and approximate outcomes.
- Assistant does not recommend investments or regulated financial actions.

## 14. Milestone 11: Polish And Safety

### Goal

Make the MVP coherent, safe, and comfortable to use.

### Tasks

- Add empty states.
- Add loading states.
- Add error states.
- Add confirmation modals.
- Add mobile layout checks.
- Add basic tests for analytics calculations.
- Add basic tests for recurring generation.
- Review financial data deletion behavior.

### Acceptance Criteria

- Core flows work on desktop and mobile widths.
- No destructive action happens without confirmation.
- Analytics and recurring calculations have tests.
- App has no obvious broken empty/loading/error states.

## 15. Out Of Scope For MVP

- Real AI API calls.
- Real OCR.
- Bank integrations.
- Currency exchange rates.
- Investment recommendations.
- Tauri wrapper.
- Advanced budgets.
- CSV import.
- Native mobile packaging.

## 16. Implementation Order

Build in this order:

1. App scaffold.
2. Supabase foundation.
3. Portfolios.
4. Accounts.
5. Manual transactions.
6. Recurring transactions.
7. Analytics dashboard.
8. Text parser mock.
9. Receipt parser mock.
10. Portfolio assistant mock.
11. Polish, tests, and safety pass.

Do not start real AI integration until the mock interfaces and main financial flows are stable.
