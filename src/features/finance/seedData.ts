import type { Category, Portfolio } from "../../shared/types/finance";
import seedData from "../../shared/data/financeSeed.json";
import type { FinanceSnapshot } from "./financeTypes";

export const seedPortfolioId = seedData.portfolio.id;

export function createDefaultCategories(portfolioId: string): Category[] {
  return seedData.categories.map((category) => ({
    ...category,
    portfolioId,
  })) as Category[];
}

export function createSeedSnapshot(portfolioName = seedData.portfolio.name): FinanceSnapshot {
  const portfolio: Portfolio = {
    ...(seedData.portfolio as Portfolio),
    name: portfolioName.trim() || seedData.portfolio.name,
  };

  return {
    activePortfolioId: seedPortfolioId,
    portfolios: [portfolio],
    accounts: [],
    categories: createDefaultCategories(seedPortfolioId),
    transactions: [],
    transactionItems: [],
  };
}
