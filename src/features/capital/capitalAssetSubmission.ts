import dayjs, { type Dayjs } from "dayjs";
import { isPositiveCapitalDecimal, normalizeCapitalDecimal, percentInputToRate } from "./capitalFormNumbers";
import { decimal, decimalString, multiply } from "../../shared/lib/decimal";
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
  const primaryProvider = market ? "tradingview" : undefined;
  const primaryAssetId = market
    ? context.provider === "tradingview" ? context.providerAssetId : context.item?.primaryProvider === "tradingview" ? context.item.primaryAssetId : symbol
    : undefined;
  const fallbackProvider = type === "crypto" ? "coingecko" : undefined;
  const fallbackAssetId = type === "crypto"
    ? context.provider === "coingecko" ? context.providerAssetId : context.item?.primaryProvider === "coingecko" ? context.item.primaryAssetId : context.item?.fallbackProvider === "coingecko" ? context.item.fallbackAssetId : undefined
    : undefined;
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
