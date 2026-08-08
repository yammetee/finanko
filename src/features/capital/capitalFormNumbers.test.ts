import { describe, expect, it } from "vitest";
import { isCapitalPercent, isNonNegativeCapitalDecimal, isNonZeroCapitalDecimal, isPositiveCapitalDecimal, normalizeCapitalDecimal, percentInputToRate, rateToPercentInput } from "./capitalFormNumbers";

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
    expect(isCapitalPercent("100.000000000000000001")).toBe(false);
    expect(isCapitalPercent("99.999999999999999999")).toBe(true);
    expect(isNonNegativeCapitalDecimal("1.1234567890123456789")).toBe(false);
    expect(isNonNegativeCapitalDecimal("123456789012345678901")).toBe(false);
  });

  it("converts stored rates to and from form percentages", () => {
    expect(rateToPercentInput("0.305")).toBe("30.5");
    expect(percentInputToRate("30,5")).toBe("0.305");
    expect(percentInputToRate(" ")).toBeUndefined();
  });

  it("accepts signed non-zero adjustments", () => {
    expect(isNonZeroCapitalDecimal("-10.5")).toBe(true);
    expect(isNonZeroCapitalDecimal("0")).toBe(false);
    expect(isNonZeroCapitalDecimal("--1")).toBe(false);
  });
});
