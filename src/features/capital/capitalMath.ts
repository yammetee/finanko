import { decimal, decimalString, divide, multiply } from "./decimal";
import type { CapitalEvent, CapitalPosition } from "./capitalTypes";

export function replayCapitalEvents(itemId: string, events: CapitalEvent[], currentPrice: string = "0"): CapitalPosition {
  let quantity = 0n;
  let costBasis = 0n;
  let realizedProfit = 0n;
  let netIncome = 0n;

  const confirmed = events
    .filter((event) => (event.itemId === itemId || event.relatedItemId === itemId) && event.status === "confirmed" && !event.deletedAt)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));

  for (const event of confirmed) {
    const eventQuantity = decimal(event.quantity);
    const unitPrice = decimal(event.unitPrice);
    const amount = event.amount === undefined ? multiply(eventQuantity, unitPrice) : decimal(event.amount);
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
          quantity += eventQuantity;
          costBasis += amount;
          break;
        default:
          break;
      }
      continue;
    }

    switch (event.type) {
      case "buy":
      case "staking":
        quantity += eventQuantity;
        costBasis += amount + fee;
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
        break;
      case "split":
        quantity = multiply(quantity, decimal(event.splitRatio));
        break;
      case "adjustment":
        quantity += eventQuantity;
        costBasis += amount;
        break;
      case "transfer":
        quantity -= eventQuantity;
        costBasis -= amount;
        break;
    }
  }

  const currentValue = multiply(quantity, decimal(currentPrice));
  const unrealizedProfit = currentValue - costBasis;
  const totalResult = unrealizedProfit + realizedProfit + netIncome;

  return {
    itemId,
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
