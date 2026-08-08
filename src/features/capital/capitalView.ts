import { convertMoney } from "../../shared/lib/currency";
import { replayCapitalEvents } from "./capitalMath";
import type { CapitalEvent, CapitalItem, CapitalQuote } from "./capitalTypes";

export function buildCapitalPositions(items: CapitalItem[], events: CapitalEvent[], quotes: Record<string, CapitalQuote> = {}, valuationDate?: string) {
  return items.filter((item) => !item.archivedAt).map((item) => {
    const itemEvents = events.map((event) => {
      if (event.currency === item.quoteCurrency) return event;
      const convert = (value?: string) => value === undefined ? undefined : String(convertMoney(Number(value), event.currency, item.quoteCurrency, event.occurredAt));
      return { ...event, amount: convert(event.amount), unitPrice: convert(event.unitPrice), fee: convert(event.fee), tax: convert(event.tax), currency: item.quoteCurrency };
    });
    const marketPrice = quotes[item.id]?.price;
    const resolvedPrice = marketPrice ? String(convertMoney(Number(marketPrice), quotes[item.id].currency, item.quoteCurrency)) : item.manualPrice ?? "0";
    const price = Number(resolvedPrice);
    const position = replayCapitalEvents(item.id, itemEvents, resolvedPrice);
    const value = Number(position.currentValue);
    const costBasisUsd = convertMoney(Number(position.costBasis), item.quoteCurrency, "USD");
    const profitUsd = convertMoney(Number(position.totalResult), item.quoteCurrency, "USD");
    const incomeUsd = convertMoney(Number(position.netIncome), item.quoteCurrency, "USD");
    return {
      item,
      ...position,
      price,
      value,
      valueUsd: convertMoney(value, item.quoteCurrency, "USD", valuationDate),
      profit: Number(position.totalResult),
      costBasisUsd,
      profitUsd,
      incomeUsd,
      quote: quotes[item.id],
      priceSource: marketPrice ? "market" as const : item.manualPrice ? "manual" as const : "missing" as const,
      quoteStale: quotes[item.id] ? Date.now() - new Date(quotes[item.id].quotedAt).getTime() > 24 * 60 * 60 * 1000 : false,
    };
  });
}

export function getCapitalTotalUsd(items: CapitalItem[], events: CapitalEvent[], quotes: Record<string, CapitalQuote> = {}) {
  return buildCapitalPositions(items, events, quotes).reduce((sum, position) => sum + position.valueUsd, 0);
}
