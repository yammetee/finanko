import { describe, expect, it } from "vitest";
import { capitalEventTimestamp, compareCapitalEvents } from "./capitalEventTime";

describe("capital event timestamps", () => {
  it("keeps same-day insertion order independently from event ids", () => {
    const first = { id: "z-first", occurredAt: "2026-08-08T15:00:00.000Z" };
    const secondTimestamp = capitalEventTimestamp("2026-08-08", {
      events: [first],
      now: new Date("2026-08-08T15:00:00.000Z"),
    });

    const second = { id: "a-second", occurredAt: secondTimestamp };
    expect(secondTimestamp).toBe("2026-08-08T15:00:00.001Z");
    expect([second, first].sort(compareCapitalEvents)).toEqual([first, second]);
  });

  it("preserves the original time when an event stays on the same date", () => {
    const existingEvent = { id: "event", occurredAt: "2026-08-08T09:42:13.777Z" };
    expect(capitalEventTimestamp("2026-08-08", {
      existingEvent,
      now: new Date("2026-08-08T18:00:00.000Z"),
    })).toBe(existingEvent.occurredAt);
  });

  it("uses the current time when an event moves to another date", () => {
    expect(capitalEventTimestamp("2026-08-09", {
      existingEvent: { id: "event", occurredAt: "2026-08-08T09:42:13.777Z" },
      now: new Date("2026-08-08T18:01:02.345Z"),
    })).toBe("2026-08-09T18:01:02.345Z");
  });
});
