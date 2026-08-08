import { decimal, decimalString, divide, multiply } from "../../shared/lib/decimal";
import { compareCapitalEvents } from "./capitalEventTime";
import type { CapitalEvent, CapitalPosition } from "./capitalTypes";

export function replayCapitalEvents(itemId: string, events: CapitalEvent[], currentPrice: string = "0", moneyBalance = false): CapitalPosition {
  let quantity = 0n;
  let costBasis = 0n;
  let realizedProfit = 0n;
  let netIncome = 0n;

  const confirmed = events
    .filter((event) => (event.itemId === itemId || event.relatedItemId === itemId) && event.status === "confirmed")
    .sort(compareCapitalEvents);

  for (const event of confirmed) {
    const eventQuantity = decimal(event.quantity);
    const amount = decimal(event.amount);
    const fee = decimal(event.fee);
    const tax = decimal(event.tax);

    if (event.relatedItemId === itemId) {
      switch (event.type) {
        case "buy":
          quantity -= amount + fee;
          costBasis -= amount + fee;
          break;
        case "sell":
          quantity += amount - fee;
          costBasis += amount - fee;
          break;
        case "dividend":
        case "interest":
          quantity += amount - tax;
          costBasis += amount - tax;
          break;
        case "transfer":
          quantity += eventQuantity || amount;
          costBasis += amount || eventQuantity;
          break;
        default:
          break;
      }
      continue;
    }

    switch (event.type) {
      case "buy":
        quantity += eventQuantity;
        costBasis += amount + fee;
        break;
      case "staking":
        quantity += eventQuantity;
        costBasis += amount;
        netIncome += amount - fee;
        break;
      case "sell": { 
        const sold = eventQuantity > quantity ? quantity : eventQuantity;
        const removedBasis = quantity === 0n ? 0n : costBasis * sold / quantity;
        quantity -= sold;
        costBasis -= removedBasis;
        realizedProfit += amount - fee - removedBasis;
        break;
      }
      case "deposit":
        quantity += eventQuantity || amount;
        costBasis += amount;
        break;
      case "withdrawal": { 
        const removed = eventQuantity || amount;
        const removedBasis = quantity === 0n ? 0n : costBasis * (removed > quantity ? quantity : removed) / quantity;
        quantity = removed > quantity ? 0n : quantity - removed;
        costBasis -= removedBasis;
        break;
      }
      case "dividend":
      case "interest":
        netIncome += amount - tax;
        if (event.reinvest) { quantity += amount - tax; costBasis += amount - tax; }
        break;
      case "fee":
      case "tax":
        netIncome -= amount;
        if (moneyBalance) { quantity -= amount; costBasis -= amount; }
        break;
      case "split":
        quantity = multiply(quantity, decimal(event.splitRatio));
        break;
      case "adjustment":
        quantity += eventQuantity || amount;
        costBasis += amount;
        break;
      case "transfer":
        quantity -= eventQuantity || amount;
        costBasis -= amount || eventQuantity;
        break;
    }
  }

  const currentValue = multiply(quantity, decimal(currentPrice));
  const unrealizedProfit = currentValue - costBasis;
  const totalResult = unrealizedProfit + realizedProfit + netIncome;

  return {
    quantity: decimalString(quantity),
    costBasis: decimalString(costBasis),
    averageCost: decimalString(divide(costBasis, quantity)),
    realizedProfit: decimalString(realizedProfit),
    netIncome: decimalString(netIncome),
    currentValue: decimalString(currentValue),
    unrealizedProfit: decimalString(unrealizedProfit),
    totalResult: decimalString(totalResult),
  };
}

export function addTransferCostBasis(event: CapitalEvent, events: CapitalEvent[]): CapitalEvent {
  if (event.type !== "transfer" || event.amount || !event.quantity) return event;
  const priorEvents = events.filter((candidate) => candidate.id !== event.id && compareCapitalEvents(candidate, event) < 0);
  const source = replayCapitalEvents(event.itemId, priorEvents);
  const available = decimal(source.quantity);
  const transferred = decimal(event.quantity);
  if (available <= 0n || transferred > available) throw new Error("capital_transfer_exceeds_balance");
  return { ...event, amount: decimalString(decimal(source.costBasis) * transferred / available) };
}

export function assertCapitalOutflowsWithinBalance(events: CapitalEvent[], itemIds: Iterable<string>) {
  const affectedItems = new Set(itemIds);
  const outflows = events
    .filter((event) => affectedItems.has(event.itemId) && event.quantity && (event.type === "sell" || event.type === "withdrawal" || event.type === "transfer" || event.type === "adjustment" && decimal(event.quantity) < 0n) && event.status === "confirmed")
    .sort(compareCapitalEvents);

  for (const outflow of outflows) {
    const priorEvents = events.filter((event) => event.id !== outflow.id && compareCapitalEvents(event, outflow) < 0);
    const available = decimal(replayCapitalEvents(outflow.itemId, priorEvents).quantity);
    const requested = outflow.type === "adjustment" ? -decimal(outflow.quantity) : decimal(outflow.quantity);
    if (requested > available) throw new Error(`capital_${outflow.type}_exceeds_balance`);
  }
}
