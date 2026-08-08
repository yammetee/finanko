import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const page = readFileSync(new URL("../features/capital/CapitalPage.tsx", import.meta.url), "utf8");
const assetForm = readFileSync(new URL("../features/capital/CapitalAssetForm.tsx", import.meta.url), "utf8");
const eventForm = readFileSync(new URL("../features/capital/CapitalEventForm.tsx", import.meta.url), "utf8");
const groupForm = readFileSync(new URL("../features/capital/CapitalGroupForm.tsx", import.meta.url), "utf8");
const expensesPage = readFileSync(new URL("../features/expenses/ExpensesPage.tsx", import.meta.url), "utf8");

describe("capital responsive and accessible states", () => {
  it("provides compact layouts for mobile and narrow screens", () => {
    expect(styles).toContain("@media (max-width: 720px)");
    expect(styles).toContain(".capital-actions { grid-template-columns: repeat(2");
    expect(styles).toContain(".capital-row-actions { align-self: start; grid-column: 2; grid-row: 1 / span 2");
    expect(styles).toContain("@media (max-width: 380px)");
    expect(styles).toContain(".capital-stats { grid-template-columns: 1fr; }");
  });

  it("makes the capital summary an explicit navigation action", () => {
    expect(expensesPage).toContain('className="capital-metric"');
    expect(expensesPage).toContain('<ArrowRight aria-hidden="true"');
    expect(styles).toContain(".capital-metric:hover { background: var(--surface-hover); border-color: var(--border-strong); }");
    expect(styles).toContain(".capital-metric { min-width: 0; }");
    expect(styles).not.toContain(".capital-metric { padding-left:");
  });

  it("keeps every form control at an iOS-safe focus size", () => {
    expect(styles).toContain("button, input, select, textarea { font: inherit; }");
    expect(styles).toContain("  input,\n  textarea,\n  select,");
    expect(styles).toContain("  .ant-select-selection-item,");
    expect(styles).toContain("  .ant-select-selection-placeholder");
    expect(styles).toContain("font-size: 16px !important;");
    expect(page).not.toContain("capital-editor");
  });

  it("keeps provider internals out of the asset form", () => {
    expect(assetForm).toContain("<ChoiceGroup");
    expect(assetForm).not.toContain("Основной источник");
    expect(assetForm).not.toContain("ID у основного источника");
    expect(assetForm).not.toContain("Запасной источник");
  });

  it("uses the shared form page pattern for every capital editor", () => {
    for (const source of [assetForm, eventForm, groupForm]) {
      expect(source).toContain('className="form-page"');
      expect(source).toContain('className="expense-form capital-form"');
      expect(source).toContain("<Form.Item");
    }
    expect(eventForm).toContain("<DatePicker");
    expect(page).not.toContain("<form");
  });

  it("exposes errors, loading, filters, and icon actions to assistive technology", () => {
    expect(page).toContain('role="alert"');
    expect(page).toContain('role="status"');
    expect(page).toContain("aria-pressed=");
    expect(page).toContain('aria-label={t("actions.edit")}');
    expect(styles).toContain("select:focus-visible");
  });
});
