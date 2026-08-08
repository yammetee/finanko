import type { Currency } from "../../shared/types/expense";

export type CapitalItemType = "stock" | "fund" | "crypto" | "cash" | "deposit";
export type CapitalEventType = "buy" | "sell" | "deposit" | "withdrawal" | "transfer" | "dividend" | "interest" | "staking" | "fee" | "tax" | "split" | "adjustment";
export type CapitalEventStatus = "expected" | "confirmed" | "ignored";

export interface CapitalGroup {
  id: string;
  name: string;
  archivedAt?: string;
}

export interface CapitalItem {
  id: string;
  groupId: string;
  name: string;
  type: CapitalItemType;
  symbol?: string;
  quoteCurrency: Currency;
  manualPrice?: string;
  primaryProvider?: "bybit" | "coingecko" | "twelve_data";
  primaryAssetId?: string;
  fallbackProvider?: "bybit" | "coingecko" | "twelve_data";
  fallbackAssetId?: string;
  archivedAt?: string;
}

export interface CapitalQuote {
  itemId: string;
  price: string;
  currency: "USD";
  provider: string;
  quotedAt: string;
}

export interface CapitalEvent {
  id: string;
  itemId: string;
  relatedItemId?: string;
  type: CapitalEventType;
  status: CapitalEventStatus;
  occurredAt: string;
  quantity?: string;
  unitPrice?: string;
  amount?: string;
  fee?: string;
  tax?: string;
  currency: Currency;
  splitRatio?: string;
  source: "manual" | "automatic";
  notes?: string;
  deletedAt?: string;
}

export interface CapitalSnapshot {
  groups: CapitalGroup[];
  items: CapitalItem[];
  events: CapitalEvent[];
}

export interface CapitalPosition {
  itemId: string;
  quantity: string;
  costBasis: string;
  averageCost: string;
  realizedProfit: string;
  netIncome: string;
  currentValue: string;
  unrealizedProfit: string;
  totalResult: string;
}
