import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const expensesPage = readFileSync(new URL("../features/expenses/ExpensesPage.tsx", import.meta.url), "utf8");
const authenticatedApp = readFileSync(new URL("./AuthenticatedApp.tsx", import.meta.url), "utf8");

describe("expense and capital isolation", () => {
  it("keeps receipt, text, and manual expense entry free of capital-store dependencies", () => {
    expect(expensesPage).not.toContain("capitalStore");
    expect(expensesPage).toContain('setFormMode("receipt")');
    expect(expensesPage).toContain('setFormMode("text")');
    expect(expensesPage).toContain('setFormMode("manual")');
  });

  it("renders expenses independently while capital initializes in a separate effect", () => {
    expect(authenticatedApp).toContain("void initializeCapital()");
    expect(authenticatedApp).toContain("<ExpensesPage");
    expect(authenticatedApp).toContain('capitalState={capital.loadState}');
  });
});
