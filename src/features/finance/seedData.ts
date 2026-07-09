import dayjs from "dayjs";
import type {
  Account,
  Category,
  Portfolio,
  RecurringRule,
  Transaction,
  TransactionItem,
} from "../../shared/types/finance";
import seedData from "../../shared/data/financeSeed.json";
import type { FinanceSnapshot } from "./financeTypes";

export const seedNow = dayjs();
export const seedPortfolioId = seedData.portfolio.id;

export const defaultCategories: Category[] = seedData.categories.map((category) => ({
  ...category,
  portfolioId: seedPortfolioId,
})) as Category[];

export const seedPortfolios: Portfolio[] = [seedData.portfolio as Portfolio];

export const seedAccounts: Account[] = seedData.accounts.map((account) => ({
  ...account,
  portfolioId: seedPortfolioId,
})) as Account[];

export const seedRecurringRules: RecurringRule[] = seedData.recurringRules.map((rule) => ({
  ...rule,
  portfolioId: seedPortfolioId,
  startsAt: seedNow.startOf("year").toISOString(),
})) as RecurringRule[];

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
    transactionFilter: "all",
    portfolios: seedPortfolios,
    accounts: seedAccounts,
    categories: defaultCategories,
    transactions: buildSeedTransactions(),
    transactionItems,
    recurringRules: seedRecurringRules,
  };
}
