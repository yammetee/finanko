import Select from "antd/es/select";
import { ACCOUNT_TYPES, CURRENCIES } from "../constants/finance";
import { useI18n } from "../i18n/i18nContext";
import type { AccountType } from "../types/finance";

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

interface AccountTypeSelectProps {
  onChange?: (type: AccountType) => void;
}

export function AccountTypeSelect({ onChange }: AccountTypeSelectProps) {
  const { t } = useI18n();

  return (
    <Select
      onChange={onChange}
      options={ACCOUNT_TYPES.map((type) => ({
        value: type,
        label: t(`accountType.${type}`),
      }))}
    />
  );
}
