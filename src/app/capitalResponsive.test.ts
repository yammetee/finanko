import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const page = readFileSync(new URL("../features/capital/CapitalPage.tsx", import.meta.url), "utf8");

describe("capital responsive and accessible states", () => {
  it("provides compact layouts for mobile and narrow screens", () => {
    expect(styles).toContain("@media (max-width: 720px)");
    expect(styles).toContain(".capital-actions { display: grid; grid-template-columns: repeat(2");
    expect(styles).toContain("@media (max-width: 380px)");
    expect(styles).toContain(".capital-stats { grid-template-columns: 1fr; }");
  });

  it("exposes errors, loading, filters, and icon actions to assistive technology", () => {
    expect(page).toContain('role="alert"');
    expect(page).toContain('role="status"');
    expect(page).toContain("aria-pressed=");
    expect(page).toContain('aria-label={ru ? "Изменить группу"');
    expect(styles).toContain("select:focus-visible");
  });
});
