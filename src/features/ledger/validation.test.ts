import { describe, expect, it } from "vitest";
import { validateItemsMatchTotal } from "./validation";

describe("ledger validation", () => {
  it("allows item totals that match transaction amount", () => {
    expect(() =>
      validateItemsMatchTotal({
        items: [{ amount: 10.25 }, { amount: 4.75 }],
        total: 15,
        currency: "USD",
      }),
    ).not.toThrow();
  });

  it("rejects item totals that do not match transaction amount", () => {
    expect(() =>
      validateItemsMatchTotal({
        items: [{ amount: 10 }, { amount: 4.99 }],
        total: 15,
        currency: "USD",
      }),
    ).toThrow("item total");
  });
});
