import type { Category, Portfolio } from "../../shared/types/finance";
import seedData from "../../shared/data/financeSeed.json";
import type { FinanceSnapshot } from "./financeTypes";

export const seedPortfolioId = seedData.portfolio.id;
const defaultExpenseCategoryNames = seedData.categories.map((category) => category.name);
const defaultExpenseCategoryNameSet = new Set(
  defaultExpenseCategoryNames.map((name) => name.toLocaleLowerCase()),
);

export function createDefaultCategories(portfolioId: string): Category[] {
  return seedData.categories.map((category) => ({
    ...category,
    portfolioId,
  })) as Category[];
}

export function isDefaultExpenseCategory(category: Category) {
  return category.type === "expense" && defaultExpenseCategoryNameSet.has(
    category.name.trim().toLocaleLowerCase(),
  );
}

export function sortDefaultExpenseCategories(categories: Category[]) {
  const order = new Map(
    defaultExpenseCategoryNames.map((name, index) => [name.toLocaleLowerCase(), index]),
  );
  return [...categories].sort(
    (left, right) =>
      (order.get(left.name.trim().toLocaleLowerCase()) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right.name.trim().toLocaleLowerCase()) ?? Number.MAX_SAFE_INTEGER),
  );
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
