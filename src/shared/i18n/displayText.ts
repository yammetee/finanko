import type { Category } from "../types/finance";
import type { MessageKey } from "./i18nContext";

type Translator = (key: MessageKey, values?: Record<string, string | number>) => string;

const categoryNameKeys: Record<string, MessageKey> = {
  bills: "category.bills",
  education: "category.education",
  entertainment: "category.entertainment",
  food: "category.food",
  home: "category.home",
  transport: "category.transport",
  health: "category.health",
  travel: "category.travel",
  subscriptions: "category.subscriptions",
  shopping: "category.shopping",
  other: "category.other",
};

export function getCategoryName(category: Category, t: Translator) {
  const key = categoryNameKeys[category.name.trim().toLocaleLowerCase()];
  return key ? t(key) : category.name;
}
