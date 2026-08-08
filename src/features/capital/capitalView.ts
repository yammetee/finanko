import { convertCapitalMoney, sumCapitalValues } from "./capitalCurrency";
import { replayCapitalEvents } from "./capitalMath";
import type { CapitalEvent, CapitalItem, CapitalQuote } from "./capitalTypes";

export function buildCapitalPositions(items: CapitalItem[], events: CapitalEvent[], quotes: Record<string, CapitalQuote> = {}, valuationDate?: string) {
  return items.map((item) => {
    const itemEvents = events.map((event) => {
      if (event.currency === item.quoteCurrency) return event;
      const convert = (value?: string) => value === undefined ? undefined : convertCapitalMoney(value, event.currency, item.quoteCurrency, event.occurredAt);
      return { ...event, amount: convert(event.amount), fee: convert(event.fee), tax: convert(event.tax), currency: item.quoteCurrency };
    });
    const marketPrice = quotes[item.id]?.price;
    const resolvedPrice = marketPrice ? convertCapitalMoney(marketPrice, quotes[item.id].currency, item.quoteCurrency, valuationDate) : item.manualPrice ?? "0";
    const price = Number(resolvedPrice);
    const position = replayCapitalEvents(item.id, itemEvents, resolvedPrice, item.type === "cash" || item.type === "deposit");
    const value = Number(position.currentValue);
    const costBasisUsd = convertCapitalMoney(position.costBasis, item.quoteCurrency, "USD", valuationDate);
    const profitUsd = convertCapitalMoney(position.totalResult, item.quoteCurrency, "USD", valuationDate);
    const incomeUsd = convertCapitalMoney(position.netIncome, item.quoteCurrency, "USD", valuationDate);
    return {
      item,
      ...position,
      price,
      value,
      valueUsd: convertCapitalMoney(position.currentValue, item.quoteCurrency, "USD", valuationDate),
      profit: Number(position.totalResult),
      costBasisUsd,
      profitUsd,
      incomeUsd,
      priceSource: marketPrice ? "market" as const : item.manualPrice ? "manual" as const : "missing" as const,
      quoteStale: quotes[item.id] ? Date.now() - new Date(quotes[item.id].quotedAt).getTime() > 24 * 60 * 60 * 1000 : false,
    };
  });
}

export function getCapitalTotalUsd(items: CapitalItem[], events: CapitalEvent[], quotes: Record<string, CapitalQuote> = {}) {
  return sumCapitalValues(buildCapitalPositions(items, events, quotes).map((position) => position.valueUsd));
}
