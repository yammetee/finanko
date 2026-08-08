import { describe, expect, it } from "vitest";
import { convertCapitalMoney, sumCapitalValues } from "./capitalCurrency";

describe("decimal-safe capital currency aggregation", () => {
  it("adds fractional values without binary floating-point drift", () => {
    expect(sumCapitalValues(["0.1", "0.2", "0.000000000000000001"])).toBe("0.300000000000000001");
  });

  it("keeps same-currency values as decimal strings", () => {
    expect(convertCapitalMoney("1234567890.123456789", "USD", "USD")).toBe("1234567890.123456789");
  });
});
