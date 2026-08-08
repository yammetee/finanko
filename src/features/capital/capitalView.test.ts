import { describe, expect, it } from "vitest";
import { buildCapitalPositions } from "./capitalView";
import type { CapitalEvent, CapitalItem } from "./capitalTypes";

describe("capital position view", () => {
  it("converts an amount-only money transfer into each item's own currency", () => {
    const items: CapitalItem[] = [
      { id: "usd", groupId: "g", name: "USD", type: "cash", quoteCurrency: "USD", manualPrice: "1" },
      { id: "rub", groupId: "g", name: "RUB", type: "cash", quoteCurrency: "RUB", manualPrice: "1" },
    ];
    const events: CapitalEvent[] = [
      { id: "1", itemId: "usd", type: "deposit", status: "confirmed", occurredAt: "2025-08-20T10:00:00Z", amount: "100", currency: "USD", source: "manual" },
      { id: "2", itemId: "usd", relatedItemId: "rub", type: "transfer", status: "confirmed", occurredAt: "2025-08-20T11:00:00Z", amount: "50", currency: "USD", source: "manual" },
    ];

    const positions = buildCapitalPositions(items, events);
    expect(positions.find((value) => value.item.id === "usd")?.quantity).toBe("50");
    expect(positions.find((value) => value.item.id === "rub")?.quantity).toBe("4800");
  });
});
