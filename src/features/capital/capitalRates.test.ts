import { describe, expect, it } from "vitest";
import { percentInputToRate, rateToPercentInput } from "./capitalRates";

describe("capital percentage inputs", () => {
  it("shows stored fractions as familiar percentages", () => {
    expect(rateToPercentInput("0.12")).toBe("12");
    expect(rateToPercentInput("0.305")).toBe("30.5");
  });

  it("stores percentages as exact fractions and accepts a decimal comma", () => {
    expect(percentInputToRate("12")).toBe("0.12");
    expect(percentInputToRate("30,5")).toBe("0.305");
    expect(percentInputToRate(" ")).toBeUndefined();
  });
});
