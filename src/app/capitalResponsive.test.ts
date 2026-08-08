import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const page = readFileSync(new URL("../features/capital/CapitalPage.tsx", import.meta.url), "utf8");

describe("capital responsive and accessible states", () => {
  it("provides compact layouts for mobile and narrow screens", () => {
    expect(styles).toContain("@media (max-width: 720px)");
    expect(styles).toContain(".capital-actions { grid-template-columns: repeat(2");
    expect(styles).toContain(".capital-row-actions { align-self: start; grid-column: 2; grid-row: 1 / span 2");
    expect(styles).toContain("@media (max-width: 380px)");
    expect(styles).toContain(".capital-stats { grid-template-columns: 1fr; }");
  });

  it("keeps capital form controls at an iOS-safe focus size", () => {
    expect(styles).toContain("button, input, select, textarea { font: inherit; }");
    expect(styles).toContain(".capital-editor input, .capital-editor select { font-size: 16px; }");
  });

  it("exposes errors, loading, filters, and icon actions to assistive technology", () => {
    expect(page).toContain('role="alert"');
    expect(page).toContain('role="status"');
    expect(page).toContain("aria-pressed=");
    expect(page).toContain('aria-label={ru ? "Изменить группу"');
    expect(styles).toContain("select:focus-visible");
  });
});
