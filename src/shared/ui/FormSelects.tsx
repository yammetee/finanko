import Select from "antd/es/select";
import type { SelectProps } from "antd/es/select";
import { CURRENCIES } from "../constants/finance";
import type { Currency } from "../types/finance";
import { CurrencyIcon } from "./CurrencyIcon";

export function CurrencySelect(props: SelectProps<Currency>) {
  return (
    <Select
      {...props}
      options={CURRENCIES.map((currency) => ({
        value: currency,
        label: <span className="currency-option"><CurrencyIcon currency={currency} />{currency}</span>,
      }))}
    />
  );
}
