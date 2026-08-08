import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const page = readFileSync(new URL("../features/capital/CapitalPage.tsx", import.meta.url), "utf8");
const assetForm = readFileSync(new URL("../features/capital/CapitalAssetForm.tsx", import.meta.url), "utf8");
const eventForm = readFileSync(new URL("../features/capital/CapitalEventForm.tsx", import.meta.url), "utf8");
const groupForm = readFileSync(new URL("../features/capital/CapitalGroupForm.tsx", import.meta.url), "utf8");
const appHeader = readFileSync(new URL("./AppHeader.tsx", import.meta.url), "utf8");
const authenticatedApp = readFileSync(new URL("./AuthenticatedApp.tsx", import.meta.url), "utf8");

describe("capital layout source contract", () => {
  it("defines compact layouts for mobile and narrow screens", () => {
    expect(styles).toContain("@media (max-width: 720px)");
    expect(styles).toContain(".capital-actions { grid-template-columns: repeat(2");
    expect(styles).toContain(".capital-row-actions { align-self: start; grid-column: 2; grid-row: 1 / span 2");
    expect(styles).toContain("@media (max-width: 380px)");
    expect(styles).toContain(".capital-stats { grid-template-columns: 1fr; }");
  });

  it("uses two header tabs in the shared application header", () => {
    expect(appHeader).toContain('className="header-tabs"');
    expect(appHeader).toContain('onPageChange("expenses")');
    expect(appHeader).toContain('onPageChange("capital")');
    expect(authenticatedApp).toContain("onPageChange={changePage}");
    expect(styles).toContain("grid-template-columns: auto minmax(0, 1fr) auto;");
    expect(styles).toContain(".header-tabs button.active");
  });

  it("defines an iOS-safe focus size for every form control", () => {
    expect(styles).toContain("button, input, select, textarea { font: inherit; }");
    expect(styles).toContain("  input,\n  textarea,\n  select,");
    expect(styles).toContain("  .ant-select-selection-item,");
    expect(styles).toContain("  .ant-select-selection-placeholder");
    expect(styles).toContain("font-size: 16px !important;");
  });

  it("uses the shared form page pattern for every capital editor", () => {
    for (const source of [assetForm, eventForm, groupForm]) {
      expect(source).toContain('className="form-page"');
      expect(source).toContain('className="expense-form"');
      expect(source).toContain("<Form.Item");
    }
    expect(eventForm).toContain("<DatePicker");
  });

  it("includes accessibility attributes for filters and icon actions", () => {
    expect(page).toContain("aria-pressed=");
    expect(page).toContain('aria-label={t("actions.edit")}');
    expect(styles).toContain("select:focus-visible");
  });
});
