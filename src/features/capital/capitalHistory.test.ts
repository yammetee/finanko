import { describe, expect, it } from "vitest";
import { rebuildCapitalHistory } from "./capitalHistory";

describe("capital history rebuild", () => {
  it("uses only events and latest quotes available on each date", () => {
    const values = rebuildCapitalHistory([{ id: "btc", groupId: "g", name: "BTC", type: "crypto", quoteCurrency: "USD" }], [{ id: "buy", itemId: "btc", type: "buy", status: "confirmed", occurredAt: "2026-01-01T12:00:00Z", quantity: "1", amount: "100", currency: "USD", source: "manual" }], [{ itemId: "btc", price: "100", currency: "USD", provider: "test", quotedAt: "2026-01-01T20:00:00Z" }, { itemId: "btc", price: "120", currency: "USD", provider: "test", quotedAt: "2026-01-02T20:00:00Z" }]);
    expect(values).toEqual([{ date: "2026-01-01", totalUsd: "100" }, { date: "2026-01-02", totalUsd: "120" }]);
  });
});
