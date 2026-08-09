import type { Category } from "../../shared/types/expense";

const defaultCategories = [
  { name: "Food", color: "#e8b94c" },
  { name: "Home", color: "#5a9feb" },
  { name: "Transport", color: "#9b82e6" },
  { name: "Health", color: "#f07f86" },
  { name: "Shopping", color: "#e58aa8" },
  { name: "Entertainment", color: "#ad7ee8" },
  { name: "Bills", color: "#58b6ad" },
  { name: "Education", color: "#c69b58" },
  { name: "Travel", color: "#65a9d8" },
  { name: "Subscriptions", color: "#9e91d8" },
  { name: "Other", color: "#8c8c8c" },
] as const;
 
const defaultCategoryNameSet = new Set(
  defaultCategories.map((category) => category.name.toLocaleLowerCase()),
);

export function createDefaultCategories(): Category[] {
  return defaultCategories.map((category) => ({
    id: `cat-${crypto.randomUUID()}`,
    ...category,
  }));
}

export function isDefaultExpenseCategory(category: Category) {
  return defaultCategoryNameSet.has(category.name.trim().toLocaleLowerCase());
}

export function sortDefaultExpenseCategories(categories: Category[]) {
  const order = new Map(
    defaultCategories.map((category, index) => [category.name.toLocaleLowerCase(), index]),
  );
  return [...categories].sort(
    (left, right) =>
      (order.get(left.name.trim().toLocaleLowerCase()) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right.name.trim().toLocaleLowerCase()) ?? Number.MAX_SAFE_INTEGER),
  );
}
