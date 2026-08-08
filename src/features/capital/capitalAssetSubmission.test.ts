import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { buildCapitalAssetSubmission, type AssetFormValues } from "./capitalAssetSubmission";
import type { CapitalGroup } from "./capitalTypes";

const group: CapitalGroup = { id: "group-main", name: "Main" };
const depositValues = (): AssetFormValues => ({
  type: "deposit",
  name: "  Рубли  ",
  currency: "RUB",
  interestRate: "6",
  interestCadence: "monthly",
  interestEffectiveFrom: dayjs("2026-08-08"),
  interestCompounding: "yes",
  openingInvested: "200000",
  occurredAt: dayjs("2026-08-08"),
});

describe("capital asset submission", () => {
  it("uses the only available group when the hidden form field is absent", () => {
    const submission = buildCapitalAssetSubmission(depositValues(), { groups: [group] });

    expect(submission).toEqual(expect.objectContaining({
      openingInvested: "200000",
      occurredAt: "2026-08-08",
      item: expect.objectContaining({
        groupId: group.id,
        name: "Рубли",
        quoteCurrency: "RUB",
        annualInterestRate: "0.06",
        interestCadence: "monthly",
        interestEffectiveFrom: "2026-08-08",
        interestCompounding: true,
      }),
    }));
  });

  it("requires an explicit group when several groups are available", () => {
    expect(() => buildCapitalAssetSubmission(depositValues(), {
      groups: [group, { id: "group-second", name: "Second" }],
    })).toThrow("capital_group_required");
  });

  it("keeps the selected group when several groups are available", () => {
    const submission = buildCapitalAssetSubmission({ ...depositValues(), groupId: "group-second" }, {
      groups: [group, { id: "group-second", name: "Second" }],
    });

    expect(submission.item.groupId).toBe("group-second");
  });

  it("leaves CoinGecko fallback id empty so the server can resolve a known crypto symbol", () => {
    const submission = buildCapitalAssetSubmission({
      type: "crypto",
      name: "Bitcoin",
      symbol: "btc",
      currency: "USD",
      occurredAt: dayjs("2026-08-08"),
    }, { groups: [group] });

    expect(submission.item).toEqual(expect.objectContaining({
      symbol: "BTC",
      primaryProvider: "bybit",
      primaryAssetId: "BTCUSDT",
      fallbackProvider: "coingecko",
      fallbackAssetId: undefined,
    }));
  });

  it("rejects a manual market symbol outside the API contract", () => {
    expect(() => buildCapitalAssetSubmission({
      type: "crypto",
      name: "Invalid",
      symbol: "BTC/USD",
      currency: "USD",
      occurredAt: dayjs("2026-08-08"),
    }, { groups: [group] })).toThrow("capital_symbol_invalid");
  });

  it("keeps an existing item's identity while allowing metadata edits", () => {
    const submission = buildCapitalAssetSubmission({
      ...depositValues(), type: "cash", currency: "USD", name: "Renamed",
    }, {
      groups: [group],
      item: {
        id: "deposit", groupId: group.id, name: "Old", type: "deposit", quoteCurrency: "RUB",
        manualPrice: "1", annualInterestRate: "0.05",
      },
    });

    expect(submission.item).toEqual(expect.objectContaining({
      type: "deposit",
      quoteCurrency: "RUB",
      name: "Renamed",
      annualInterestRate: "0.06",
    }));
  });
});
