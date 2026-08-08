import type { CapitalEventType, CapitalItemType } from "./capitalTypes";

const MONEY_EVENTS: CapitalEventType[] = ["deposit", "withdrawal", "transfer", "interest", "fee", "tax", "adjustment"];
const SECURITY_EVENTS: CapitalEventType[] = ["buy", "sell", "deposit", "withdrawal", "transfer", "dividend", "fee", "tax", "split", "adjustment"];
const CRYPTO_EVENTS: CapitalEventType[] = ["buy", "sell", "deposit", "withdrawal", "transfer", "staking", "fee", "tax", "split", "adjustment"];

export function getCapitalEventTypes(itemType?: CapitalItemType) {
  if (itemType === "cash" || itemType === "deposit") return MONEY_EVENTS;
  if (itemType === "crypto") return CRYPTO_EVENTS;
  if (itemType === "stock" || itemType === "fund") return SECURITY_EVENTS;
  return [];
}

export function isCapitalEventTypeAllowed(itemType: CapitalItemType, eventType: CapitalEventType) {
  return getCapitalEventTypes(itemType).includes(eventType);
}
