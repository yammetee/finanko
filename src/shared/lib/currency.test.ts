import { describe, expect, it } from "vitest";
import { convertMoney, setLiveExchangeRates } from "./currency";

describe("currency conversion", () => {
  it("does not apply live rates to historical dates", () => {
    setLiveExchangeRates({
      date: "2026-07-09",
      USD: 1,
      GEL: 100,
      RUB: 100,
      THB: 100,
    });

    expect(convertMoney(1, "USD", "GEL", "2025-01-15")).toBe(2.82);
    setLiveExchangeRates(null);
  });

  it("uses live rates for same-day conversion", () => {
    setLiveExchangeRates({
      date: "2026-07-09",
      USD: 1,
      GEL: 3,
      RUB: 90,
      THB: 36,
    });

    expect(convertMoney(1, "USD", "GEL", "2026-07-09")).toBe(3);
    setLiveExchangeRates(null);
  });

  it("uses the latest known historical rate before the requested date", () => {
    setLiveExchangeRates(null);

    expect(convertMoney(1, "USD", "RUB", "2025-08-20")).toBe(96);
    expect(convertMoney(96, "RUB", "USD", "2025-08-20")).toBe(1);
  });

  it("falls back to the oldest bundled rate when the requested date is earlier than known history", () => {
    setLiveExchangeRates(null);

    expect(convertMoney(1, "USD", "THB", "2020-01-01")).toBe(34.6);
  });

  it("keeps conversion display-only by not mutating source objects", () => {
    const transaction = {
      amount: 100,
      currency: "USD" as const,
      occurredAt: "2026-01-10T00:00:00.000Z",
    };

    const converted = convertMoney(
      transaction.amount,
      transaction.currency,
      "THB",
      transaction.occurredAt,
    );

    expect(converted).toBe(3640);
    expect(transaction).toEqual({
      amount: 100,
      currency: "USD",
      occurredAt: "2026-01-10T00:00:00.000Z",
    });
  });
});
