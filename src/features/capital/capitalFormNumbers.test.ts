import { describe, expect, it } from "vitest";
import { isCapitalPercent, isNonNegativeCapitalDecimal, isPositiveCapitalDecimal, normalizeCapitalDecimal } from "./capitalFormNumbers";

describe("capital form decimals", () => {
  it("keeps decimals as strings and accepts comma input", () => {
    expect(normalizeCapitalDecimal("0,000000000000000123")).toBe("0.000000000000000123");
    expect(isPositiveCapitalDecimal("0,000000000000000123")).toBe(true);
  });

  it("rejects malformed, negative, zero-positive, and oversized percent values", () => {
    expect(isNonNegativeCapitalDecimal("1.2.3")).toBe(false);
    expect(isNonNegativeCapitalDecimal("-1")).toBe(false);
    expect(isPositiveCapitalDecimal("0.000")).toBe(false);
    expect(isCapitalPercent("100,01")).toBe(false);
  });
});

