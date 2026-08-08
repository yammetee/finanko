import AutoComplete from "antd/es/auto-complete";
import DatePicker from "antd/es/date-picker";
import Form from "antd/es/form";
import Input from "antd/es/input";
import Select from "antd/es/select";
import dayjs from "dayjs";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "../../shared/i18n/i18nContext";
import { ChoiceGroup } from "../../shared/ui/ChoiceGroup";
import { CurrencyIcon } from "../../shared/ui/CurrencyIcon";
import { buildCapitalAssetSubmission, type AssetFormValues, type CapitalAssetSubmission } from "./capitalAssetSubmission";
import { getCapitalCadenceLabel, getCapitalItemLabel } from "./capitalLabels";
import { isCapitalPercent, isPositiveCapitalDecimal, rateToPercentInput } from "./capitalFormNumbers";
import { isMarketSymbol } from "./marketContract";
import { searchMarketAssets } from "./marketRepository";
import { CAPITAL_CURRENCIES, type CapitalAssetSuggestion, type CapitalGroup, type CapitalItem, type CapitalItemType } from "./capitalTypes";

const ITEM_TYPES: CapitalItemType[] = ["stock", "fund", "crypto", "cash", "deposit"];
const CADENCES: NonNullable<CapitalItem["interestCadence"]>[] = ["monthly", "quarterly", "yearly"];

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
  const [provider, setProvider] = useState(item?.primaryProvider);
  const [providerAssetId, setProviderAssetId] = useState(item?.primaryAssetId);

  const market = type === "stock" || type === "fund" || type === "crypto";

  useEffect(() => {
    if (item || !market || query.trim().length < 2) { setSuggestions([]); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      void searchMarketAssets(query.trim(), type).then((values) => { if (active) setSuggestions(values); }).catch(() => { if (active) setSuggestions([]); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [item, market, query, type]);

  const chooseSuggestion = (value: CapitalAssetSuggestion) => {
    form.setFieldsValue({ name: value.name, symbol: value.symbol, currency: "USD" });
    setProvider(value.provider); setProviderAssetId(value.providerAssetId); setQuery(""); setSuggestions([]);
  };

  const suggestionOptions = suggestions.map((value) => ({
    label: `${value.name} · ${value.symbol} · ${getCapitalItemLabel(value.type, locale)}`,
    value: `${value.provider}:${value.providerAssetId}`,
  }));

  const submit = (values: AssetFormValues) => onSave(buildCapitalAssetSubmission(values, { item, groups, provider, providerAssetId }));

  const initialValues: AssetFormValues = {
    type: item?.type ?? "stock", name: item?.name ?? "", groupId: item?.groupId ?? groups[0]?.id ?? "", symbol: item?.symbol,
    currency: item?.quoteCurrency ?? "USD", occurredAt: dayjs(),
    interestRate: rateToPercentInput(item?.annualInterestRate) || undefined,
    interestCadence: item?.interestCadence ?? "monthly", interestEffectiveFrom: dayjs(item?.interestEffectiveFrom ?? undefined),
    interestCompounding: item?.interestCompounding ? "yes" : "no", incomeDestinationItemId: item?.incomeDestinationItemId,
    defaultTaxPercent: rateToPercentInput(item?.defaultTaxRate) || undefined,
  };

  const cashItems = items.filter((value) => (value.type === "cash" || value.type === "deposit") && value.id !== item?.id);
  return <section className="form-page">
    <header className="page-heading"><button type="button" onClick={onBack} aria-label={t("actions.back")}><ArrowLeft size={19}/></button><h1>{t(item ? "capital.asset.edit" : "capital.asset.new")}</h1></header>
    <Form className="expense-form" form={form} layout="vertical" initialValues={initialValues} onFinish={submit}>
      {!item ? <Form.Item name="type" noStyle><ChoiceGroup label={t("capital.asset.type")} options={ITEM_TYPES.map((value) => ({ value, label: getCapitalItemLabel(value, locale) }))} onChange={(value) => { if (value !== type) form.setFieldsValue({ symbol: undefined, openingPrice: undefined }); setProvider(undefined); setProviderAssetId(undefined); }}/></Form.Item> : null}
      {!item && market ? <Form.Item label={t("capital.asset.search")}><AutoComplete autoFocus filterOption={false} options={suggestionOptions} value={query} onChange={setQuery} onSelect={(key) => { const selected = suggestions.find((value) => `${value.provider}:${value.providerAssetId}` === key); if (selected) chooseSuggestion(selected); }}/></Form.Item> : null}
      <Form.Item name="name" label={t("form.name")} rules={[{ required: true, whitespace: true, message: t("capital.validation.name") }]}><Input maxLength={120}/></Form.Item>
      {groups.length > 1 ? <Form.Item name="groupId" label={t("capital.asset.group")} rules={[{ required: true }]}><Select options={groups.map((value) => ({ value: value.id, label: value.name }))}/></Form.Item> : null}
      {market && !item ? <Form.Item name="symbol" label={t("capital.asset.symbol")} rules={[{ validator: (_, value) => isMarketSymbol(value) ? Promise.resolve() : Promise.reject(new Error(t("capital.validation.symbol"))) }]}><Input autoCapitalize="characters" maxLength={32} onChange={() => { setProvider(undefined); setProviderAssetId(undefined); }}/></Form.Item> : null}
      {!item ? <Form.Item name="currency" noStyle><ChoiceGroup label={t("form.currency")} options={CAPITAL_CURRENCIES.map((value) => ({ value, label: <><CurrencyIcon currency={value} size={12}/>{value}</> }))}/></Form.Item> : null}
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
        {market ? <><Form.Item name="openingPrice" label={t("capital.asset.purchasePrice")} rules={[{ validator: (_, value) => isPositiveCapitalDecimal(value) ? Promise.resolve() : Promise.reject(new Error(t("capital.validation.positive"))) }]}><Input inputMode="decimal"/></Form.Item><Form.Item name="openingQuantity" label={t("capital.asset.quantity")} rules={[{ validator: (_, value) => isPositiveCapitalDecimal(value) ? Promise.resolve() : Promise.reject(new Error(t("capital.validation.positive"))) }]}><Input inputMode="decimal"/></Form.Item></> : <Form.Item name="openingInvested" label={t("capital.asset.balance")} rules={[{ validator: (_, value) => isPositiveCapitalDecimal(value) ? Promise.resolve() : Promise.reject(new Error(t("capital.validation.positive"))) }]}><Input inputMode="decimal"/></Form.Item>}
        <Form.Item name="occurredAt" label={t("form.date")}><DatePicker allowClear={false}/></Form.Item>
      </> : null}
      <button className="primary-action" disabled={saving} type="submit">{t("capital.save")}</button>
    </Form>
  </section>;
}
