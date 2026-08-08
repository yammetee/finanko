import { describe, expect, it } from "vitest";
import { buildExpectedInterestEvents } from "./interestRules";
import type { CapitalEvent, CapitalItem } from "./capitalTypes";

const item: CapitalItem = { id: "deposit", groupId: "g", name: "Deposit", type: "deposit", quoteCurrency: "USD", manualPrice: "1", annualInterestRate: "0.12", interestCadence: "monthly", interestEffectiveFrom: "2026-01-01", interestCompounding: true, defaultTaxRate: "0.3" };
const deposit: CapitalEvent = { id: "d", itemId: "deposit", type: "deposit", status: "confirmed", occurredAt: "2026-01-01T12:00:00Z", amount: "1000", currency: "USD", source: "manual" };

describe("automatic interest rules", () => {
  it("creates an editable idempotent expected event with withholding tax", () => {
    const generated = buildExpectedInterestEvents([item], [deposit], new Date("2026-02-01T18:00:00Z"));
    expect(generated[0]).toMatchObject({ amount: "10", tax: "3", status: "expected", reinvest: true, externalProvider: "finanko_interest" });
    expect(buildExpectedInterestEvents([item], [...generated, deposit], new Date("2026-02-01T18:00:00Z"))).toEqual([]);
    const confirmed = { ...generated[0], status: "confirmed" as const };
    expect(buildExpectedInterestEvents([item], [deposit, confirmed], new Date("2026-03-01T18:00:00Z"))[0]).toMatchObject({ occurredAt: "2026-03-01T12:00:00.000Z", amount: "10.07" });
  });
});
