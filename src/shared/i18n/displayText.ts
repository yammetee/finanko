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

export function getPortfolioName(portfolio: Portfolio, t: Translator) {
  void t;
  return portfolio.name;
}

export function getAccountName(account: Account, t: Translator) {
  void t;
  return account.name;
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
  void t;
  return transaction.description;
}
