import type { Locale } from "../../shared/i18n/i18nContext";
import type { CapitalEventType, CapitalItem, CapitalItemType } from "./capitalTypes";

const events: Record<CapitalEventType, [string, string]> = {
  buy: ["Покупка", "Buy"], sell: ["Продажа", "Sell"], deposit: ["Пополнение", "Deposit"], withdrawal: ["Вывод", "Withdrawal"], transfer: ["Перевод", "Transfer"],
  dividend: ["Дивиденд", "Dividend"], interest: ["Проценты", "Interest"], staking: ["Стейкинг", "Staking"], fee: ["Комиссия", "Fee"], tax: ["Налог", "Tax"], split: ["Сплит", "Split"], adjustment: ["Корректировка", "Adjustment"],
};
const items: Record<CapitalItemType, [string, string]> = { stock: ["Акция", "Stock"], fund: ["Фонд", "Fund"], crypto: ["Криптовалюта", "Crypto"], cash: ["Деньги", "Cash"], deposit: ["Вклад", "Deposit"] };
const cadences: Record<NonNullable<CapitalItem["interestCadence"]>, [string, string]> = { monthly: ["Ежемесячно", "Monthly"], quarterly: ["Ежеквартально", "Quarterly"], yearly: ["Ежегодно", "Yearly"] };

const pick = (labels: [string, string], locale: Locale) => labels[locale === "ru" ? 0 : 1];
export const getCapitalEventLabel = (value: CapitalEventType, locale: Locale) => pick(events[value], locale);
export const getCapitalItemLabel = (value: CapitalItemType, locale: Locale) => pick(items[value], locale);
export const getCapitalCadenceLabel = (value: NonNullable<CapitalItem["interestCadence"]>, locale: Locale) => pick(cadences[value], locale);
