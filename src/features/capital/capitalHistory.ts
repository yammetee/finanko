import { buildCapitalPositions } from "./capitalView";
import { sumCapitalValues } from "./capitalCurrency";
import type { CapitalEvent, CapitalItem, CapitalQuote, CapitalValuation } from "./capitalTypes";

export function rebuildCapitalHistory(items: CapitalItem[], events: CapitalEvent[], history: CapitalQuote[]): CapitalValuation[] {
  const dates = new Set<string>();
  for (const event of events) if (event.status === "confirmed") dates.add(event.occurredAt.slice(0, 10));
  for (const quote of history) dates.add(quote.quotedAt.slice(0, 10));
  return [...dates].sort().map((date) => {
    const end = `${date}T23:59:59.999Z`;
    const quotes: Record<string, CapitalQuote> = {};
    for (const quote of history.filter((value) => value.quotedAt <= end).sort((a, b) => a.quotedAt.localeCompare(b.quotedAt))) quotes[quote.itemId] = quote;
    const relevantEvents = events.filter((event) => event.occurredAt <= end);
    const total = sumCapitalValues(buildCapitalPositions(items, relevantEvents, quotes, date).map((position) => position.valueUsd));
    return { date, totalUsd: total };
  });
}
