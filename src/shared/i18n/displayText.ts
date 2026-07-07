import type { Account, Category, Portfolio, Transaction } from "../types/finance";
import type { MessageKey } from "./i18nContext";

type Translator = (key: MessageKey, values?: Record<string, string | number>) => string;

const categoryNameKeys: Record<string, MessageKey> = {
  "cat-salary": "category.salary",
  "cat-food": "category.food",
  "cat-home": "category.home",
  "cat-transport": "category.transport",
  "cat-health": "category.health",
  "cat-travel": "category.travel",
  "cat-subscriptions": "category.subscriptions",
  "cat-other": "category.other",
};

const accountNameKeys: Record<string, MessageKey> = {
  "acc-bank": "demo.account.bank",
  "acc-card": "demo.account.card",
  "acc-savings": "demo.account.savings",
  "acc-credit-rub": "demo.account.credit",
};

const transactionDescriptionKeys: Array<[RegExp, MessageKey]> = [
  [/^Salary$/, "demo.transaction.salary"],
  [/^Savings transfer$/, "demo.transaction.savings"],
  [/^Rent$/, "demo.transaction.rent"],
  [/^Rent and utilities$/, "demo.transaction.home"],
  [/^Groceries, cafes, drinks$/, "demo.transaction.food"],
  [/^Transport and taxi$/, "demo.transaction.transport"],
  [/^Health and sport$/, "demo.transaction.health"],
  [/^Travel and weekends$/, "demo.transaction.travel"],
  [/^Subscriptions and software$/, "demo.transaction.subscriptions"],
];

export function getPortfolioName(portfolio: Portfolio, t: Translator) {
  if (portfolio.id === "portfolio-personal") return t("demo.portfolio.personal");
  return portfolio.name;
}

export function getAccountName(account: Account, t: Translator) {
  const key = accountNameKeys[account.id];
  return key ? t(key) : account.name;
}

export function getCategoryName(category: Category, t: Translator) {
  const key = categoryNameKeys[category.id];
  return key ? t(key) : category.name;
}

export function getCategoryNameById(id: string, fallback: string, t: Translator) {
  const key = categoryNameKeys[id];
  return key ? t(key) : fallback;
}

export function getTransactionDescription(transaction: Transaction, t: Translator) {
  const match = transactionDescriptionKeys.find(([pattern]) =>
    pattern.test(transaction.description),
  );
  return match ? t(match[1]) : transaction.description;
}
