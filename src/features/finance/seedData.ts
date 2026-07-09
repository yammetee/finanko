import type {
  Account,
  Category,
  Portfolio,
  RecurringRule,
  TransactionItem,
} from "../../shared/types/finance";
import seedData from "../../shared/data/financeSeed.json";
import type { FinanceSnapshot } from "./financeTypes";

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

export const seedRecurringRules: RecurringRule[] = [];

export function createSeedSnapshot(): FinanceSnapshot {
  const transactionItems: TransactionItem[] = [];

  return {
    activePortfolioId: seedPortfolioId,
    timeframe: "month",
    transactionFilter: "all",
    currencyDisplay: "native",
    portfolios: seedPortfolios,
    accounts: seedAccounts,
    categories: defaultCategories,
    transactions: [],
    transactionItems,
    recurringRules: seedRecurringRules,
  };
}
