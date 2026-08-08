export const CAPITAL_CURRENCIES = ["USD", "GEL", "RUB", "THB"] as const;
export type CapitalCurrency = typeof CAPITAL_CURRENCIES[number];
export type CapitalItemType = "stock" | "fund" | "crypto" | "cash" | "deposit";
export type CapitalEventType = "buy" | "sell" | "deposit" | "withdrawal" | "transfer" | "dividend" | "interest" | "staking" | "fee" | "tax" | "split" | "adjustment";
export type CapitalEventStatus = "expected" | "confirmed" | "ignored";

export interface CapitalGroup {
  id: string;
  name: string;
}

export interface CapitalItem {
  id: string;
  groupId: string;
  name: string;
  type: CapitalItemType;
  symbol?: string;
  quoteCurrency: CapitalCurrency;
  manualPrice?: string;
  primaryProvider?: "bybit" | "coingecko" | "nasdaq" | "yahoo";
  primaryAssetId?: string;
  fallbackProvider?: "bybit" | "coingecko" | "nasdaq" | "yahoo";
  fallbackAssetId?: string;
  annualInterestRate?: string;
  interestCadence?: "monthly" | "quarterly" | "yearly";
  interestEffectiveFrom?: string;
  interestCompounding?: boolean;
  incomeDestinationItemId?: string;
  defaultTaxRate?: string;
}

export interface CapitalQuote {
  itemId: string;
  price: string;
  currency: "USD";
  provider: string;
  quotedAt: string;
}

export interface CapitalAssetSuggestion {
  name: string;
  symbol: string;
  type: "stock" | "fund" | "crypto";
  provider: "coingecko" | "nasdaq";
  providerAssetId: string;
}

export interface CapitalEvent {
  id: string;
  itemId: string;
  relatedItemId?: string;
  type: CapitalEventType;
  status: CapitalEventStatus;
  occurredAt: string;
  quantity?: string;
  amount?: string;
  fee?: string;
  tax?: string;
  currency: CapitalCurrency;
  splitRatio?: string;
  source: "manual" | "automatic";
  reinvest?: boolean;
  externalProvider?: string;
  externalId?: string;
}

export interface CapitalSnapshot {
  groups: CapitalGroup[];
  items: CapitalItem[];
  events: CapitalEvent[];
  latestQuotes?: CapitalQuote[];
  quoteHistory?: CapitalQuote[];
  valuations?: CapitalValuation[];
}

export interface CapitalValuation { date: string; totalUsd: string }

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
