import type { AccountType, Currency, Timeframe } from "../types/finance";
import type { MessageKey } from "../i18n/i18nContext";

export const CURRENCIES: Currency[] = ["USD", "GEL", "RUB", "THB"];

export const ACCOUNT_TYPES: AccountType[] = [
  "cash",
  "bank",
  "card",
  "savings",
  "investment",
  "crypto",
  "debt",
  "credit",
  "mortgage",
  "custom",
];

export const TIMEFRAME_OPTIONS: Array<{ label: MessageKey; value: Timeframe }> = [
  { label: "timeframe.week", value: "week" },
  { label: "timeframe.month", value: "month" },
  { label: "timeframe.year", value: "year" },
  { label: "timeframe.all", value: "all" },
];
