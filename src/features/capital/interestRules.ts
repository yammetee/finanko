import { decimal, decimalString, divide, multiply } from "./decimal";
import { replayCapitalEvents } from "./capitalMath";
import { capitalEventTimestamp, compareCapitalEvents } from "./capitalEventTime";
import type { CapitalEvent, CapitalItem } from "./capitalTypes";

const cadenceMonths = { monthly: 1, quarterly: 3, yearly: 12 } as const;
const cadencePeriods = { monthly: 12, quarterly: 4, yearly: 1 } as const;

const addClampedUtcMonths = (date: string, months: number) => {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(normalizedMonth + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
};

export function buildExpectedInterestEvents(items: CapitalItem[], events: CapitalEvent[], today = new Date()): CapitalEvent[] {
  const result: CapitalEvent[] = [];
  const todayDate = today.toISOString().slice(0, 10);
  for (const item of items) {
    if (!item.annualInterestRate || !item.interestCadence || !item.interestEffectiveFrom) continue;
    const step = cadenceMonths[item.interestCadence];
    let period = 1;
    let date = addClampedUtcMonths(item.interestEffectiveFrom, step * period);
    let externalId = `${item.id}:${date}`;
    while (date <= todayDate) {
      const matchingEvents = events.filter((event) => event.externalProvider === "finanko_interest" && event.externalId === externalId);
      if (matchingEvents.some((event) => event.status === "expected")) break;
      if (!matchingEvents.length) {
        const eventId = `capital-event-interest-${item.id}-${date}`;
        const occurredAt = capitalEventTimestamp(date, {
          events: [...events, ...result],
          now: new Date(`${date}T00:00:00.000Z`),
        });
        const eligible = events.filter((event) => compareCapitalEvents(event, { id: eventId, occurredAt }) < 0);
        const balance = decimal(replayCapitalEvents(item.id, eligible, item.manualPrice ?? "1", item.type === "cash" || item.type === "deposit").currentValue);
        if (balance > 0n) {
          const gross = divide(multiply(balance, decimal(item.annualInterestRate)), decimal(cadencePeriods[item.interestCadence]));
          if (gross > 0n) {
            const tax = multiply(gross, decimal(item.defaultTaxRate));
            result.push({ id: eventId, itemId: item.id, relatedItemId: item.incomeDestinationItemId, type: "interest", status: "expected", occurredAt, amount: decimalString(gross), tax: decimalString(tax), currency: item.quoteCurrency, source: "automatic", reinvest: item.interestCompounding && !item.incomeDestinationItemId, externalProvider: "finanko_interest", externalId });
          }
        }
        break;
      }
      period += 1;
      date = addClampedUtcMonths(item.interestEffectiveFrom, step * period);
      externalId = `${item.id}:${date}`;
    }
  }
  return result;
}
