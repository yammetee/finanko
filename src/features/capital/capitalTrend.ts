import { sumCapitalValues } from "./capitalCurrency";
import type { CapitalEvent, CapitalItem, CapitalQuote } from "./capitalTypes";
import { buildCapitalPositions } from "./capitalView";

export interface CapitalTrendPoint {
  date: string;
  totalUsd: string;
}

const eventDate = (event: CapitalEvent) => event.occurredAt.slice(0, 10);

export function buildCurrentPriceCapitalTrend(items: CapitalItem[], events: CapitalEvent[], quotes: Record<string, CapitalQuote>, today: string): CapitalTrendPoint[] {
  if (!items.length) return [];

  const confirmedEvents = events.filter((event) => event.status === "confirmed");
  const dates = new Set(confirmedEvents.map(eventDate));
  dates.add(today);

  return [...dates].sort().map((date) => {
    const eventsAtDate = confirmedEvents.filter((event) => eventDate(event) <= date);
    const totalUsd = sumCapitalValues(buildCapitalPositions(items, eventsAtDate, quotes, date).map((position) => position.valueUsd));
    return { date, totalUsd };
  });
}
