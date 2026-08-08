import { describe, expect, it } from "vitest";
import { rebuildCapitalHistory } from "./capitalHistory";

describe("capital history rebuild", () => {
  it("uses only events and latest quotes available on each date", () => {
    const values = rebuildCapitalHistory([{ id: "btc", groupId: "g", name: "BTC", type: "crypto", quoteCurrency: "USD" }], [{ id: "buy", itemId: "btc", type: "buy", status: "confirmed", occurredAt: "2026-01-01T12:00:00Z", quantity: "1", amount: "100", currency: "USD", source: "manual" }], [{ itemId: "btc", price: "100", currency: "USD", provider: "test", quotedAt: "2026-01-01T20:00:00Z" }, { itemId: "btc", price: "120", currency: "USD", provider: "test", quotedAt: "2026-01-02T20:00:00Z" }]);
    expect(values).toEqual([{ date: "2026-01-01", totalUsd: "100" }, { date: "2026-01-02", totalUsd: "120" }]);
  });

  it("preserves an archived asset in snapshots before its archive date", () => {
    const archived = [{ id: "btc", groupId: "g", name: "BTC", type: "crypto" as const, quoteCurrency: "USD" as const, archivedAt: "2026-01-03T10:00:00.000Z" }];
    const events = [{ id: "buy", itemId: "btc", type: "buy" as const, status: "confirmed" as const, occurredAt: "2026-01-01T12:00:00.000Z", quantity: "1", amount: "100", currency: "USD" as const, source: "manual" as const }];
    const history = [
      { itemId: "btc", price: "100", currency: "USD" as const, provider: "bybit", quotedAt: "2026-01-02T12:00:00.000Z" },
      { itemId: "btc", price: "120", currency: "USD" as const, provider: "bybit", quotedAt: "2026-01-03T12:00:00.000Z" },
    ];
    expect(rebuildCapitalHistory(archived, events, history)).toEqual([
      { date: "2026-01-01", totalUsd: "0" },
      { date: "2026-01-02", totalUsd: "100" },
      { date: "2026-01-03", totalUsd: "0" },
    ]);
  });
});
