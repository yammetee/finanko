import { decimal, decimalString, divide, multiply } from "./decimal";
import { replayCapitalEvents } from "./capitalMath";
import type { CapitalEvent, CapitalItem } from "./capitalTypes";

const cadenceMonths = { monthly: 1, quarterly: 3, yearly: 12 } as const;
const cadencePeriods = { monthly: 12, quarterly: 4, yearly: 1 } as const;

export function buildExpectedInterestEvents(items: CapitalItem[], events: CapitalEvent[], today = new Date()): CapitalEvent[] {
  const result: CapitalEvent[] = [];
  for (const item of items) {
    if (item.archivedAt || !item.annualInterestRate || !item.interestCadence || !item.interestEffectiveFrom) continue;
    const due = new Date(`${item.interestEffectiveFrom.slice(0, 10)}T12:00:00Z`);
    const step = cadenceMonths[item.interestCadence];
    due.setUTCMonth(due.getUTCMonth() + step);
    if (due > today) continue;
    let date = due.toISOString().slice(0, 10);
    let externalId = `${item.id}:${date}`;
    while (due <= today && events.some((event) => event.externalProvider === "finanko_interest" && event.externalId === externalId)) {
      due.setUTCMonth(due.getUTCMonth() + step);
      date = due.toISOString().slice(0, 10);
      externalId = `${item.id}:${date}`;
    }
    if (due > today) continue;
    const eligible = events.filter((event) => event.occurredAt.slice(0, 10) <= date);
    const balance = decimal(replayCapitalEvents(item.id, eligible, item.manualPrice ?? "1").currentValue);
    if (balance <= 0n) continue;
    const gross = divide(multiply(balance, decimal(item.annualInterestRate)), decimal(cadencePeriods[item.interestCadence]));
    const tax = multiply(gross, decimal(item.defaultTaxRate));
    result.push({ id: `capital-event-interest-${item.id}-${date}`, itemId: item.id, relatedItemId: item.incomeDestinationItemId, type: "interest", status: "expected", occurredAt: due.toISOString(), amount: decimalString(gross), tax: decimalString(tax), currency: item.quoteCurrency, source: "automatic", reinvest: item.interestCompounding && !item.incomeDestinationItemId, externalProvider: "finanko_interest", externalId });
  }
  return result;
}
