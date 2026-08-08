import Alert from "antd/es/alert";
import Button from "antd/es/button";
import DatePicker from "antd/es/date-picker";
import Form from "antd/es/form";
import Input from "antd/es/input";
import List from "antd/es/list";
import Select from "antd/es/select";
import dayjs, { type Dayjs } from "dayjs";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "../../shared/i18n/i18nContext";
import { ChoiceGroup } from "../../shared/ui/ChoiceGroup";
import { CurrencyIcon } from "../../shared/ui/CurrencyIcon";
import { getCapitalCadenceLabel, getCapitalItemLabel } from "./capitalLabels";
import { isCapitalPercent, isNonNegativeCapitalDecimal, isPositiveCapitalDecimal, normalizeCapitalDecimal, percentInputToRate, rateToPercentInput } from "./capitalFormNumbers";
import { searchMarketAssets } from "./marketRepository";
import { CAPITAL_CURRENCIES, type CapitalAssetSuggestion, type CapitalCurrency, type CapitalGroup, type CapitalItem, type CapitalItemType } from "./capitalTypes";

const ITEM_TYPES: CapitalItemType[] = ["stock", "fund", "crypto", "cash", "deposit"];
const CADENCES: NonNullable<CapitalItem["interestCadence"]>[] = ["monthly", "quarterly", "yearly"];

interface AssetFormValues {
  type: CapitalItemType;
  name: string;
  groupId: string;
  symbol?: string;
  currency: CapitalCurrency;
  manualPrice?: string;
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

interface Props {
  item?: CapitalItem;
  groups: CapitalGroup[];
  items: CapitalItem[];
  saving: boolean;
  onBack: () => void;
  onSave: (submission: CapitalAssetSubmission) => void | Promise<void>;
}

export function CapitalAssetForm({ item, groups, items, saving, onBack, onSave }: Props) {
  const { locale, t } = useI18n();
  const [form] = Form.useForm<AssetFormValues>();
  const type = Form.useWatch("type", form) ?? item?.type ?? "stock";
  const interestRate = Form.useWatch("interestRate", form);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<CapitalAssetSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [provider, setProvider] = useState(item?.primaryProvider);
  const [providerAssetId, setProviderAssetId] = useState(item?.primaryAssetId);

  useEffect(() => {
    if (item || query.trim().length < 2) { setSuggestions([]); setSearchError(false); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      setSearching(true); setSearchError(false);
      void searchMarketAssets(query.trim()).then((values) => { if (active) setSuggestions(values); }).catch(() => { if (active) { setSuggestions([]); setSearchError(true); } }).finally(() => { if (active) setSearching(false); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [item, query]);

  const chooseSuggestion = (value: CapitalAssetSuggestion) => {
    form.setFieldsValue({ type: value.type, name: value.name, symbol: value.symbol, currency: "USD" });
    setProvider(value.provider); setProviderAssetId(value.providerAssetId); setQuery(""); setSuggestions([]); setSearchError(false);
  };

  const submit = (values: AssetFormValues) => {
    const market = values.type === "stock" || values.type === "fund" || values.type === "crypto";
    const symbol = values.symbol?.trim().toUpperCase();
    const primaryProvider = provider ?? (values.type === "crypto" ? "bybit" : market ? "nasdaq" : undefined);
    const primaryAssetId = providerAssetId ?? (primaryProvider === "bybit" && symbol ? `${symbol}USDT` : symbol);
    const fallbackProvider = values.type === "crypto" ? (primaryProvider === "coingecko" ? "bybit" : "coingecko") : market ? "yahoo" : undefined;
    const itemValue: Omit<CapitalItem, "id"> = {
      groupId: values.groupId, name: values.name.trim(), type: values.type, symbol: symbol || undefined,
      quoteCurrency: values.currency, manualPrice: market ? normalizeCapitalDecimal(values.manualPrice) : "1",
      primaryProvider, primaryAssetId, fallbackProvider, fallbackAssetId: values.type === "crypto" && fallbackProvider === "bybit" && symbol ? `${symbol}USDT` : symbol,
      annualInterestRate: values.type === "deposit" ? percentInputToRate(normalizeCapitalDecimal(values.interestRate)) : undefined,
      interestCadence: values.type === "deposit" && isPositiveCapitalDecimal(values.interestRate) ? values.interestCadence ?? "monthly" : undefined,
      interestEffectiveFrom: values.type === "deposit" && isPositiveCapitalDecimal(values.interestRate) ? (values.interestEffectiveFrom ?? dayjs()).format("YYYY-MM-DD") : undefined,
      interestCompounding: values.type === "deposit" && isPositiveCapitalDecimal(values.interestRate) ? values.interestCompounding === "yes" : false,
      incomeDestinationItemId: values.type === "deposit" && isPositiveCapitalDecimal(values.interestRate) ? values.incomeDestinationItemId || undefined : undefined,
      defaultTaxRate: values.type === "deposit" && isPositiveCapitalDecimal(values.interestRate) ? percentInputToRate(normalizeCapitalDecimal(values.defaultTaxPercent)) : undefined,
    };
    return onSave({ item: itemValue, openingQuantity: normalizeCapitalDecimal(values.openingQuantity), openingInvested: normalizeCapitalDecimal(values.openingInvested), occurredAt: values.occurredAt.format("YYYY-MM-DD") });
  };

  const initialValues: AssetFormValues = {
    type: item?.type ?? "stock", name: item?.name ?? "", groupId: item?.groupId ?? groups[0]?.id ?? "", symbol: item?.symbol,
    currency: item?.quoteCurrency ?? "USD", manualPrice: item?.manualPrice, occurredAt: dayjs(),
    interestRate: rateToPercentInput(item?.annualInterestRate) || undefined,
    interestCadence: item?.interestCadence ?? "monthly", interestEffectiveFrom: dayjs(item?.interestEffectiveFrom ?? undefined),
    interestCompounding: item?.interestCompounding ? "yes" : "no", incomeDestinationItemId: item?.incomeDestinationItemId,
    defaultTaxPercent: rateToPercentInput(item?.defaultTaxRate) || undefined,
  };

  const market = type === "stock" || type === "fund" || type === "crypto";
  const cashItems = items.filter((value) => (value.type === "cash" || value.type === "deposit") && value.id !== item?.id);
  return <section className="form-page">
    <header className="page-heading"><button type="button" onClick={onBack} aria-label={t("actions.back")}><ArrowLeft size={19}/></button><h1>{t(item ? "capital.asset.edit" : "capital.asset.new")}</h1></header>
    <Form className="expense-form capital-form" form={form} layout="vertical" initialValues={initialValues} onFinish={submit}>
      {!item ? <Form.Item label={t("capital.asset.search")}><Input autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("capital.asset.searchPlaceholder")}/>{searching ? <small aria-live="polite">{t("capital.asset.searching")}</small> : null}{searchError ? <Alert message={t("capital.asset.searchError")} type="warning" showIcon/> : null}{suggestions.length ? <List dataSource={suggestions} renderItem={(value) => <List.Item><Button block type="text" onClick={() => chooseSuggestion(value)}><strong>{value.name}</strong> · {value.symbol} · {getCapitalItemLabel(value.type, locale)}</Button></List.Item>}/>: null}</Form.Item> : null}
      <Form.Item name="type" noStyle><ChoiceGroup label={t("capital.asset.type")} options={ITEM_TYPES.map((value) => ({ value, label: getCapitalItemLabel(value, locale) }))} onChange={(value) => { if (value !== type) form.setFieldsValue({ symbol: undefined, manualPrice: undefined }); setProvider(undefined); setProviderAssetId(undefined); }}/></Form.Item>
      <Form.Item name="name" label={t("form.name")} rules={[{ required: true, whitespace: true, message: t("capital.validation.name") }]}><Input maxLength={120}/></Form.Item>
      {groups.length > 1 ? <Form.Item name="groupId" label={t("capital.asset.group")} rules={[{ required: true }]}><Select options={groups.map((value) => ({ value: value.id, label: value.name }))}/></Form.Item> : null}
      {market ? <Form.Item name="symbol" label={t("capital.asset.symbol")} rules={[{ required: true, whitespace: true, message: t("capital.validation.symbol") }]}><Input autoCapitalize="characters" maxLength={32}/></Form.Item> : null}
      <Form.Item name="currency" noStyle><ChoiceGroup label={t("form.currency")} options={CAPITAL_CURRENCIES.map((value) => ({ value, label: <><CurrencyIcon currency={value} size={12}/>{value}</> }))}/></Form.Item>
      {market ? <Form.Item name="manualPrice" label={t("capital.asset.manualPrice")} rules={[{ validator: (_, value) => isNonNegativeCapitalDecimal(value) ? Promise.resolve() : Promise.reject(new Error(t("capital.validation.nonNegative"))) }]}><Input inputMode="decimal"/></Form.Item> : null}
      {type === "deposit" ? <>
        <Form.Item name="interestRate" label={t("capital.asset.interestRate")} rules={[{ validator: (_, value) => isCapitalPercent(value) ? Promise.resolve() : Promise.reject(new Error(t("capital.validation.percent"))) }]}><Input inputMode="decimal"/></Form.Item>
        {interestRate ? <>
          <Form.Item name="interestCadence" label={t("capital.asset.interestCadence")}><Select options={CADENCES.map((value) => ({ value, label: getCapitalCadenceLabel(value, locale) }))}/></Form.Item>
          <Form.Item name="interestEffectiveFrom" label={t("capital.asset.interestStart")}><DatePicker allowClear={false}/></Form.Item>
          <Form.Item name="defaultTaxPercent" label={t("capital.asset.taxRate")} rules={[{ validator: (_, value) => isCapitalPercent(value) ? Promise.resolve() : Promise.reject(new Error(t("capital.validation.percent"))) }]}><Input inputMode="decimal"/></Form.Item>
          {cashItems.length ? <Form.Item name="incomeDestinationItemId" label={t("capital.asset.incomeDestination")}><Select allowClear options={cashItems.map((value) => ({ value: value.id, label: value.name }))}/></Form.Item> : null}
          <Form.Item name="interestCompounding" noStyle><ChoiceGroup label={t("capital.asset.compounding")} options={[{ value: "no", label: t("capital.no") }, { value: "yes", label: t("capital.yes") }]}/></Form.Item>
        </> : null}
      </> : null}
      {!item ? <>
        {market ? <Form.Item name="openingQuantity" label={t("capital.asset.quantity")} dependencies={["openingInvested"]} rules={[({ getFieldValue }) => ({ validator(_, value) { if (value && !isPositiveCapitalDecimal(value)) return Promise.reject(new Error(t("capital.validation.positive"))); return getFieldValue("openingInvested") && !value ? Promise.reject(new Error(t("capital.validation.quantityPair"))) : Promise.resolve(); } })]}><Input inputMode="decimal"/></Form.Item> : null}
        <Form.Item name="openingInvested" label={market ? t("capital.asset.invested") : t("capital.asset.balance")} dependencies={["openingQuantity"]} rules={[({ getFieldValue }) => ({ validator(_, value) { if (value && !isPositiveCapitalDecimal(value)) return Promise.reject(new Error(t("capital.validation.positive"))); return market && getFieldValue("openingQuantity") && !value ? Promise.reject(new Error(t("capital.validation.investedPair"))) : Promise.resolve(); } })]}><Input inputMode="decimal"/></Form.Item>
        <Form.Item name="occurredAt" label={t("form.date")}><DatePicker allowClear={false}/></Form.Item>
      </> : null}
      <button className="primary-action" disabled={saving} type="submit">{t("capital.save")}</button>
    </Form>
  </section>;
}
