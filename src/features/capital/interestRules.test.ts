import { describe, expect, it } from "vitest";
import { buildExpectedInterestEvents } from "./interestRules";
import type { CapitalEvent, CapitalItem } from "./capitalTypes";

const item: CapitalItem = { id: "deposit", groupId: "g", name: "Deposit", type: "deposit", quoteCurrency: "USD", manualPrice: "1", annualInterestRate: "0.12", interestCadence: "monthly", interestEffectiveFrom: "2026-01-01", interestCompounding: true, defaultTaxRate: "0.3" };
const deposit: CapitalEvent = { id: "d", itemId: "deposit", type: "deposit", status: "confirmed", occurredAt: "2026-01-01T12:00:00Z", amount: "1000", currency: "USD", source: "manual" };

describe("automatic interest rules", () => {
  it("creates an editable idempotent expected event with withholding tax", () => {
    const generated = buildExpectedInterestEvents([item], [deposit], new Date("2026-02-01T18:00:00Z"));
    expect(generated[0]).toMatchObject({ occurredAt: "2026-02-01T00:00:00.000Z", amount: "10", tax: "3", status: "expected", reinvest: true, externalProvider: "finanko_interest" });
    expect(buildExpectedInterestEvents([item], [...generated, deposit], new Date("2026-02-01T18:00:00Z"))).toEqual([]);
    const confirmed = { ...generated[0], status: "confirmed" as const };
    expect(buildExpectedInterestEvents([item], [deposit, confirmed], new Date("2026-03-01T18:00:00Z"))[0]).toMatchObject({ occurredAt: "2026-03-01T00:00:00.000Z", amount: "10.07" });
  });

  it("clamps monthly periods to month end without losing the original anchor day", () => {
    const monthEndItem = { ...item, interestEffectiveFrom: "2026-01-31" };
    const opening = { ...deposit, occurredAt: "2026-01-31T09:00:00.000Z" };
    const february = buildExpectedInterestEvents([monthEndItem], [opening], new Date("2026-02-28T23:00:00.000Z"))[0];
    expect(february.occurredAt).toBe("2026-02-28T00:00:00.000Z");

    const ignoredFebruary = { ...february, status: "ignored" as const };
    expect(buildExpectedInterestEvents([monthEndItem], [opening, ignoredFebruary], new Date("2026-03-31T23:00:00.000Z"))[0].occurredAt)
      .toBe("2026-03-31T00:00:00.000Z");
  });

  it("restores leap day for yearly periods anchored on February 29", () => {
    const leapItem = { ...item, interestCadence: "yearly" as const, interestEffectiveFrom: "2024-02-29" };
    const opening = { ...deposit, occurredAt: "2024-02-29T09:00:00.000Z" };
    const handled: CapitalEvent[] = [opening];
    for (const date of ["2025-02-28", "2026-02-28", "2027-02-28"]) {
      const expected = buildExpectedInterestEvents([leapItem], handled, new Date(`${date}T23:00:00.000Z`))[0];
      expect(expected.occurredAt.slice(0, 10)).toBe(date);
      handled.push({ ...expected, status: "ignored" });
    }
    expect(buildExpectedInterestEvents([leapItem], handled, new Date("2028-02-29T23:00:00.000Z"))[0].occurredAt.slice(0, 10))
      .toBe("2028-02-29");
  });

  it("orders an automatic event after all same-day balance changes", () => {
    const sameDayDeposit = { ...deposit, occurredAt: "2026-02-01T18:42:10.123Z" };
    const generated = buildExpectedInterestEvents([item], [sameDayDeposit], new Date("2026-02-01T23:00:00.000Z"))[0];
    expect(generated).toMatchObject({ occurredAt: "2026-02-01T18:42:10.124Z", amount: "10" });
  });

  it("waits for the current expected event and advances immediately after it is ignored", () => {
    const first = buildExpectedInterestEvents([item], [deposit], new Date("2026-04-01T23:00:00.000Z"))[0];
    expect(first.occurredAt.slice(0, 10)).toBe("2026-02-01");
    expect(buildExpectedInterestEvents([item], [deposit, first], new Date("2026-04-01T23:00:00.000Z"))).toEqual([]);

    const second = buildExpectedInterestEvents([item], [deposit, { ...first, status: "ignored" }], new Date("2026-04-01T23:00:00.000Z"));
    expect(second).toHaveLength(1);
    expect(second[0].occurredAt.slice(0, 10)).toBe("2026-03-01");
  });

  it("does not persist an interest event that rounds below database precision", () => {
    const tinyRate = { ...item, annualInterestRate: "0.000000000000000001" };
    const tinyBalance = { ...deposit, amount: "1" };
    expect(buildExpectedInterestEvents([tinyRate], [tinyBalance], new Date("2026-02-01T18:00:00Z"))).toEqual([]);
  });
});
