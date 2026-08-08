import dayjs, { type Dayjs } from "dayjs";
import { isPositiveCapitalDecimal, normalizeCapitalDecimal, percentInputToRate } from "./capitalFormNumbers";
import { decimal, decimalString, multiply } from "./decimal";
import { normalizeMarketSymbol } from "./marketContract";
import type { CapitalCurrency, CapitalGroup, CapitalItem, CapitalItemType } from "./capitalTypes";

export interface AssetFormValues {
  type: CapitalItemType;
  name: string;
  groupId?: string;
  symbol?: string;
  currency: CapitalCurrency;
  openingPrice?: string;
  openingQuantity?: string;
  openingInvested?: string;
  occurredAt: Dayjs;
  interestRate?: string;
  interestCadence?: NonNullable<CapitalItem["interestCadence"]>;
  interestEffectiveFrom?: Dayjs;
  interestCompounding?: "yes" | "no";
  incomeDestinationItemId?: string;
  defaultTaxPercent?: string;
}

export interface CapitalAssetSubmission {
  item: Omit<CapitalItem, "id">;
  openingQuantity?: string;
  openingInvested?: string;
  occurredAt: string;
}

interface SubmissionContext {
  item?: CapitalItem;
  groups: CapitalGroup[];
  provider?: CapitalItem["primaryProvider"];
  providerAssetId?: string;
}

export function buildCapitalAssetSubmission(values: AssetFormValues, context: SubmissionContext): CapitalAssetSubmission {
  const groupId = values.groupId || context.item?.groupId || (context.groups.length === 1 ? context.groups[0].id : undefined);
  if (!groupId || !context.groups.some((group) => group.id === groupId)) throw new Error("capital_group_required");

  const type = context.item?.type ?? values.type;
  const currency = context.item?.quoteCurrency ?? values.currency;
  const market = type === "stock" || type === "fund" || type === "crypto";
  const symbol = normalizeMarketSymbol(context.item?.symbol ?? values.symbol);
  if (market && !symbol) throw new Error("capital_symbol_invalid");
  const primaryProvider = market ? context.item?.primaryProvider ?? context.provider ?? (type === "crypto" ? "bybit" : "nasdaq") : undefined;
  const primaryAssetId = market ? context.item?.primaryAssetId ?? context.providerAssetId ?? (primaryProvider === "bybit" && symbol ? `${symbol}USDT` : symbol) : undefined;
  const fallbackProvider = context.item?.fallbackProvider ?? (type === "crypto" ? (primaryProvider === "coingecko" ? "bybit" : "coingecko") : market ? "yahoo" : undefined);
  const fallbackAssetId = context.item?.fallbackAssetId ?? (type === "crypto" ? (fallbackProvider === "bybit" && symbol ? `${symbol}USDT` : undefined) : symbol);
  const hasInterest = type === "deposit" && isPositiveCapitalDecimal(values.interestRate);
  const openingQuantity = normalizeCapitalDecimal(values.openingQuantity);
  const openingPrice = normalizeCapitalDecimal(values.openingPrice);
  const openingInvested = market && openingQuantity && openingPrice
    ? decimalString(multiply(decimal(openingQuantity), decimal(openingPrice)))
    : normalizeCapitalDecimal(values.openingInvested);

  return {
    item: {
      groupId, name: values.name.trim(), type, symbol: symbol || undefined,
      quoteCurrency: currency, manualPrice: market ? context.item?.manualPrice : "1",
      primaryProvider, primaryAssetId, fallbackProvider, fallbackAssetId,
      annualInterestRate: type === "deposit" ? percentInputToRate(normalizeCapitalDecimal(values.interestRate)) : undefined,
      interestCadence: hasInterest ? values.interestCadence ?? "monthly" : undefined,
      interestEffectiveFrom: hasInterest ? (values.interestEffectiveFrom ?? dayjs()).format("YYYY-MM-DD") : undefined,
      interestCompounding: hasInterest ? values.interestCompounding === "yes" : false,
      incomeDestinationItemId: hasInterest ? values.incomeDestinationItemId || undefined : undefined,
      defaultTaxRate: hasInterest ? percentInputToRate(normalizeCapitalDecimal(values.defaultTaxPercent)) : undefined,
    },
    openingQuantity,
    openingInvested,
    occurredAt: values.occurredAt.format("YYYY-MM-DD"),
  };
}
