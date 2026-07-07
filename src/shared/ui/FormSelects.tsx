import { Select } from "antd";
import { ACCOUNT_TYPES, CURRENCIES } from "../constants/finance";
import { useI18n } from "../i18n/i18nContext";

export function CurrencySelect() {
  return (
    <Select
      options={CURRENCIES.map((currency) => ({
        value: currency,
        label: currency,
      }))}
    />
  );
}

export function AccountTypeSelect() {
  const { t } = useI18n();

  return (
    <Select
      options={ACCOUNT_TYPES.map((type) => ({
        value: type,
        label: t(`accountType.${type}`),
      }))}
    />
  );
}
