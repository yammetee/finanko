export const CAPITAL_CURRENCIES = ["USD", "GEL", "RUB", "THB"] as const;
export type CapitalCurrency = typeof CAPITAL_CURRENCIES[number];
export type CapitalItemType = "stock" | "fund" | "crypto" | "cash" | "deposit";
export type CapitalEventType = "buy" | "sell" | "deposit" | "withdrawal" | "transfer" | "dividend" | "interest" | "staking" | "fee" | "tax" | "split" | "adjustment";
type CapitalEventStatus = "expected" | "confirmed" | "ignored";

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
  primaryProvider?: "coingecko" | "tradingview";
  primaryAssetId?: string;
  fallbackProvider?: "coingecko" | "tradingview";
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
  logoUrl?: string;
}

export interface CapitalAssetSuggestion {
  name: string;
  symbol: string;
  type: "stock" | "fund" | "crypto";
  provider: "coingecko" | "tradingview";
  providerAssetId: string;
  logoUrl?: string;
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

export interface CapitalPortfolio {
  groups: CapitalGroup[];
  items: CapitalItem[];
  events: CapitalEvent[];
}

export interface CapitalPosition {
  quantity: string;
  costBasis: string;
  averageCost: string;
  realizedProfit: string;
  netIncome: string;
  currentValue: string;
  unrealizedProfit: string;
  totalResult: string;
}
