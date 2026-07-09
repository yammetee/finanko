import Select from "antd/es/select";
import type { SelectProps } from "antd/es/select";
import { ACCOUNT_TYPES, CURRENCIES } from "../constants/finance";
import { useI18n } from "../i18n/i18nContext";
import type { AccountType, Currency } from "../types/finance";

export function CurrencySelect(props: SelectProps<Currency>) {
  return (
    <Select
      {...props}
      options={CURRENCIES.map((currency) => ({
        value: currency,
        label: currency,
      }))}
    />
  );
}

type AccountTypeSelectProps = SelectProps<AccountType>;

export function AccountTypeSelect(props: AccountTypeSelectProps) {
  const { t } = useI18n();

  return (
    <Select
      {...props}
      options={ACCOUNT_TYPES.map((type) => ({
        value: type,
        label: t(`accountType.${type}`),
      }))}
    />
  );
}
