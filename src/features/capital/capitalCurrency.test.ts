import { describe, expect, it } from "vitest";
import { convertCapitalMoney, sumCapitalValues } from "./capitalCurrency";
import { setLiveExchangeRates } from "../../shared/lib/currency";

describe("decimal-safe capital currency aggregation", () => {
  it("adds fractional values without binary floating-point drift", () => {
    expect(sumCapitalValues(["0.1", "0.2", "0.000000000000000001"])).toBe("0.300000000000000001");
  });

  it("keeps same-currency values as decimal strings", () => {
    expect(convertCapitalMoney("1234567890.123456789", "USD", "USD")).toBe("1234567890.123456789");
  });

  it("uses historical FX for dated capital values and live FX for current values", () => {
    setLiveExchangeRates({ date: "2026-08-08", USD: 1, GEL: 100, RUB: 100, THB: 100 });
    expect(convertCapitalMoney("96", "RUB", "USD", "2025-08-20")).toBe("1");
    expect(convertCapitalMoney("100", "RUB", "USD")).toBe("1");
    setLiveExchangeRates(null);
  });
});
