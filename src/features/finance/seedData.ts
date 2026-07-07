import dayjs from "dayjs";
import type {
  Account,
  Category,
  Portfolio,
  RecurringRule,
  Transaction,
  TransactionItem,
} from "../../shared/types/finance";
import type { FinanceSnapshot } from "./financeTypes";

export const seedNow = dayjs();
export const seedPortfolioId = "portfolio-personal";

export const defaultCategories: Category[] = [
  { id: "cat-salary", portfolioId: seedPortfolioId, name: "Salary", type: "income", color: "#75d99a" },
  { id: "cat-food", portfolioId: seedPortfolioId, name: "Food", type: "expense", color: "#e8bd4f" },
  { id: "cat-home", portfolioId: seedPortfolioId, name: "Home", type: "expense", color: "#80aee8" },
  { id: "cat-transport", portfolioId: seedPortfolioId, name: "Transport", type: "expense", color: "#a999e6" },
  { id: "cat-health", portfolioId: seedPortfolioId, name: "Health", type: "expense", color: "#e88d91" },
  { id: "cat-travel", portfolioId: seedPortfolioId, name: "Travel", type: "expense", color: "#65c8d6" },
  { id: "cat-subscriptions", portfolioId: seedPortfolioId, name: "Subscriptions", type: "expense", color: "#bd9de0" },
  { id: "cat-other", portfolioId: seedPortfolioId, name: "Other", type: "expense", color: "#94a3b8" },
];

export const seedPortfolios: Portfolio[] = [
  { id: seedPortfolioId, name: "Personal", baseCurrency: "USD" },
];

export const seedAccounts: Account[] = [
  {
    id: "acc-bank",
    portfolioId: seedPortfolioId,
    name: "Main bank",
    type: "bank",
    currency: "USD",
    initialBalance: -23950,
    color: "#6fbfe6",
  },
  {
    id: "acc-card",
    portfolioId: seedPortfolioId,
    name: "Daily card",
    type: "card",
    currency: "USD",
    initialBalance: 0,
    color: "#a999e6",
  },
  {
    id: "acc-savings",
    portfolioId: seedPortfolioId,
    name: "Emergency fund",
    type: "savings",
    currency: "USD",
    initialBalance: 0,
    color: "#75d99a",
  },
  {
    id: "acc-credit-rub",
    portfolioId: seedPortfolioId,
    name: "Credit balance",
    type: "debt",
    currency: "RUB",
    initialBalance: -900000,
    color: "#e88d91",
  },
];

export const seedRecurringRules: RecurringRule[] = [
  {
    id: "rec-rent",
    portfolioId: seedPortfolioId,
    accountId: "acc-bank",
    type: "expense",
    amount: 1200,
    currency: "USD",
    categoryId: "cat-home",
    description: "Rent",
    dayOfMonth: 4,
    startsAt: seedNow.startOf("year").toISOString(),
    isActive: true,
  },
];

export function buildSeedTransactions() {
  const transactions: Transaction[] = [];
  const start = seedNow.subtract(35, "month").startOf("month");
  const expensePlan = [
    { categoryId: "cat-home", description: "Rent and utilities", ratio: 0.42 },
    { categoryId: "cat-food", description: "Groceries, cafes, drinks", ratio: 0.24 },
    { categoryId: "cat-transport", description: "Transport and taxi", ratio: 0.1 },
    { categoryId: "cat-health", description: "Health and sport", ratio: 0.08 },
    { categoryId: "cat-travel", description: "Travel and weekends", ratio: 0.1 },
    { categoryId: "cat-subscriptions", description: "Subscriptions and software", ratio: 0.06 },
  ];

  for (let monthIndex = 0; monthIndex < 36; monthIndex += 1) {
    const month = start.add(monthIndex, "month");
    const oldLifestyle = month.isBefore(seedNow.subtract(7, "month"), "month");
    const monthlyExpenses = oldLifestyle
      ? [3600, 3350, 3800, 3450, 3900, 3200][monthIndex % 6]
      : [2200, 1950, 2050, 1850, 2150, 2000][monthIndex % 6];

    transactions.push({
      id: `seed-salary-${month.format("YYYY-MM")}`,
      portfolioId: seedPortfolioId,
      accountId: "acc-bank",
      type: "income",
      amount: 4000,
      currency: "USD",
      categoryId: "cat-salary",
      description: "Salary",
      occurredAt: month.date(1).hour(10).toISOString(),
      source: "manual",
    });

    expensePlan.forEach((expense, expenseIndex) => {
      transactions.push({
        id: `seed-expense-${month.format("YYYY-MM")}-${expense.categoryId}`,
        portfolioId: seedPortfolioId,
        accountId: "acc-card",
        type: "expense",
        amount: Math.round(monthlyExpenses * expense.ratio),
        currency: "USD",
        categoryId: expense.categoryId,
        description: expense.description,
        occurredAt: month.date(4 + expenseIndex * 4).hour(13).toISOString(),
        source:
          expense.categoryId === "cat-home" || expense.categoryId === "cat-subscriptions"
            ? "recurring"
            : "manual",
        recurringRuleId: expense.categoryId === "cat-home" ? "rec-rent" : undefined,
      });
    });

    if (monthIndex % 4 === 0) {
      transactions.push({
        id: `seed-savings-${month.format("YYYY-MM")}`,
        portfolioId: seedPortfolioId,
        accountId: "acc-savings",
        type: "income",
        amount: oldLifestyle ? 150 : 450,
        currency: "USD",
        categoryId: "cat-salary",
        description: "Savings transfer",
        occurredAt: month.date(24).hour(12).toISOString(),
        source: "manual",
      });
    }
  }

  return transactions;
}

export function createSeedSnapshot(): FinanceSnapshot {
  const transactionItems: TransactionItem[] = [];

  return {
    activePortfolioId: seedPortfolioId,
    timeframe: "month",
    portfolios: seedPortfolios,
    accounts: seedAccounts,
    categories: defaultCategories,
    transactions: buildSeedTransactions(),
    transactionItems,
    recurringRules: seedRecurringRules,
  };
}
