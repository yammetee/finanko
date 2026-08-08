import { describe, expect, it } from "vitest";
import { addTransferCostBasis, assertCapitalOutflowsWithinBalance, replayCapitalEvents } from "./capitalMath";
import type { CapitalEvent } from "./capitalTypes";

const base = { itemId: "btc", status: "confirmed", occurredAt: "2026-01-01", currency: "USD", source: "manual" } as const;
const event = (value: Partial<CapitalEvent> & Pick<CapitalEvent, "id" | "type">): CapitalEvent => ({ ...base, ...value });

describe("capital event replay", () => {
  it("calculates weighted average and partial-sale profit without floating point", () => {
    const result = replayCapitalEvents("btc", [
      event({ id: "1", type: "buy", quantity: "0.1", amount: "5000", fee: "10" }),
      event({ id: "2", type: "buy", quantity: "0.2", amount: "12000" }),
      event({ id: "3", type: "sell", quantity: "0.1", amount: "7000", fee: "5" }),
    ]);
    expect(result.quantity).toBe("0.2");
    expect(result.costBasis).toBe("11340");
    expect(result.averageCost).toBe("56700");
    expect(result.realizedProfit).toBe("1325");
  });

  it("excludes expected events and preserves cost basis through a split", () => {
    const result = replayCapitalEvents("btc", [
      event({ id: "1", type: "buy", quantity: "2", amount: "200" }),
      event({ id: "2", type: "split", splitRatio: "2" }),
      event({ id: "3", type: "dividend", amount: "20", tax: "6", status: "expected" }),
      event({ id: "4", type: "dividend", amount: "10", tax: "3" }),
    ]);
    expect(result.quantity).toBe("4");
    expect(result.costBasis).toBe("200");
    expect(result.averageCost).toBe("50");
    expect(result.netIncome).toBe("7");
  });

  it("calculates current, unrealized, realized, income, and total result", () => {
    const result = replayCapitalEvents("btc", [
      event({ id: "1", type: "buy", quantity: "2", amount: "200", fee: "4" }),
      event({ id: "2", type: "sell", quantity: "1", amount: "130", fee: "2" }),
      event({ id: "3", type: "dividend", amount: "10", tax: "3" }),
    ], "120");
    expect(result.currentValue).toBe("120");
    expect(result.costBasis).toBe("102");
    expect(result.realizedProfit).toBe("26");
    expect(result.unrealizedProfit).toBe("18");
    expect(result.netIncome).toBe("7");
    expect(result.totalResult).toBe("51");
  });

  it("applies linked buy, sale, income, and transfer effects to the related item", () => {
    const events = [
      event({ id: "0", itemId: "cash", type: "deposit", amount: "1000" }),
      event({ id: "1", type: "buy", quantity: "2", amount: "200", fee: "5", relatedItemId: "cash" }),
      event({ id: "2", type: "sell", quantity: "1", amount: "130", fee: "2", relatedItemId: "cash" }),
      event({ id: "3", type: "dividend", amount: "10", tax: "3", relatedItemId: "cash" }),
      event({ id: "4", itemId: "cash", type: "transfer", quantity: "50", amount: "50", relatedItemId: "cash-2" }),
    ];
    expect(replayCapitalEvents("cash", events, "1").quantity).toBe("880");
    expect(replayCapitalEvents("cash-2", events, "1").quantity).toBe("50");
  });

  it("moves a money balance when a transfer contains only amount", () => {
    const events = [
      event({ id: "1", itemId: "cash", type: "deposit", amount: "100" }),
      event({ id: "2", itemId: "cash", type: "transfer", amount: "25", relatedItemId: "cash-2" }),
    ];
    expect(replayCapitalEvents("cash", events, "1").quantity).toBe("75");
    expect(replayCapitalEvents("cash-2", events, "1").quantity).toBe("25");
  });

  it("applies an amount-only correction to a money balance", () => {
    const result = replayCapitalEvents("cash", [
      event({ id: "1", itemId: "cash", type: "deposit", amount: "100" }),
      event({ id: "2", itemId: "cash", type: "adjustment", amount: "5" }),
    ], "1");
    expect(result.quantity).toBe("105");
    expect(result.costBasis).toBe("105");
  });

  it("deducts standalone fees and taxes from a money balance once", () => {
    const result = replayCapitalEvents("cash", [
      event({ id: "1", itemId: "cash", type: "deposit", amount: "100" }),
      event({ id: "2", itemId: "cash", type: "fee", amount: "4" }),
      event({ id: "3", itemId: "cash", type: "tax", amount: "6" }),
    ], "1", true);
    expect(result.quantity).toBe("90");
    expect(result.costBasis).toBe("90");
    expect(result.netIncome).toBe("-10");
    expect(result.totalResult).toBe("-10");
  });

  it("adjusts market quantity without inventing cost basis", () => {
    const result = replayCapitalEvents("btc", [
      event({ id: "1", type: "buy", quantity: "2", amount: "200" }),
      event({ id: "2", type: "adjustment", quantity: "-0.5" }),
    ], "100");
    expect(result.quantity).toBe("1.5");
    expect(result.costBasis).toBe("200");
  });

  it("rejects quantity withdrawals and transfers above the available position", () => {
    const events = [
      event({ id: "1", type: "buy", quantity: "1", amount: "100" }),
      event({ id: "2", type: "withdrawal", quantity: "2", occurredAt: "2026-02-01" }),
    ];
    expect(() => assertCapitalOutflowsWithinBalance(events, ["btc"])).toThrow("capital_withdrawal_exceeds_balance");
  });

  it("rejects a negative correction that would create a short position", () => {
    const events = [
      event({ id: "1", type: "buy", quantity: "1", amount: "100" }),
      event({ id: "2", type: "adjustment", quantity: "-2", occurredAt: "2026-02-01" }),
    ];
    expect(() => assertCapitalOutflowsWithinBalance(events, ["btc"])).toThrow("capital_adjustment_exceeds_balance");
  });

  it("counts staking rewards as income and fair-value cost basis", () => {
    const result = replayCapitalEvents("btc", [
      event({ id: "1", type: "staking", quantity: "0.01", amount: "100", fee: "2" }),
    ], "10000");
    expect(result.costBasis).toBe("100");
    expect(result.netIncome).toBe("98");
    expect(result.totalResult).toBe("98");
  });

  it("replays backdated events by date and id, not insertion order", () => {
    const result = replayCapitalEvents("btc", [
      event({ id: "2", type: "sell", quantity: "1", amount: "150", occurredAt: "2026-02-01" }),
      event({ id: "1", type: "buy", quantity: "1", amount: "100", occurredAt: "2026-01-01" }),
    ]);
    expect(result.quantity).toBe("0");
    expect(result.realizedProfit).toBe("50");
  });

  it("uses the replay timestamp order when calculating transfer cost basis", () => {
    const buy = event({ id: "z-buy", type: "buy", occurredAt: "2026-01-01T12:00:00.000Z", quantity: "2", amount: "100" });
    const transfer = event({ id: "a-transfer", type: "transfer", occurredAt: "2026-01-01T12:00:00.001Z", quantity: "0.5", relatedItemId: "btc-2" });

    expect(addTransferCostBasis(transfer, [transfer, buy])).toEqual(expect.objectContaining({ amount: "25" }));
  });

  it("preserves database-scale decimal precision without floating-point drift", () => {
    const result = replayCapitalEvents("btc", [
      event({ id: "1", type: "buy", quantity: "0.0000000001", amount: "0.123456789012345678" }),
      event({ id: "2", type: "buy", quantity: "0.0000000002", amount: "0.246913578024691357" }),
    ], "1234567890.1234567890");
    expect(result.quantity).toBe("0.0000000003");
    expect(result.currentValue).toBe("0.370370367037037036");
    expect(result.totalResult).toBe("0.000000000000000001");
  });
});
