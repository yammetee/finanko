import DatePicker from "antd/es/date-picker";
import Form from "antd/es/form";
import Input from "antd/es/input";
import Select from "antd/es/select";
import dayjs, { type Dayjs } from "dayjs";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "../../shared/i18n/i18nContext";
import { ChoiceGroup } from "../../shared/ui/ChoiceGroup";
import { CurrencyIcon } from "../../shared/ui/CurrencyIcon";
import { capitalEventTimestamp } from "./capitalEventTime";
import { isNonNegativeCapitalDecimal, isNonZeroCapitalDecimal, isPositiveCapitalDecimal, normalizeCapitalDecimal } from "./capitalFormNumbers";
import { decimal, decimalString, divide, multiply } from "../../shared/lib/decimal";
import { getCapitalEventLabel } from "./capitalLabels";
import { getCapitalEventTypes } from "./capitalEventRules";
import { CAPITAL_CURRENCIES, type CapitalCurrency, type CapitalEvent, type CapitalEventType, type CapitalItem } from "./capitalTypes";

const QUANTITY_TYPES: CapitalEventType[] = ["buy", "sell", "staking"];
const AMOUNT_TYPES: CapitalEventType[] = ["dividend", "interest", "staking", "fee", "tax"];
const RELATED_TYPES: CapitalEventType[] = ["buy", "sell", "transfer", "dividend", "interest"];
const FEE_TYPES: CapitalEventType[] = ["buy", "sell", "staking"];
const TAX_TYPES: CapitalEventType[] = ["dividend", "interest"];

interface EventFormValues {
  itemId: string;
  type: CapitalEventType;
  occurredAt: Dayjs;
  relatedItemId?: string;
  quantity?: string;
  unitPrice?: string;
  amount?: string;
  currency: CapitalCurrency;
  fee?: string;
  tax?: string;
  splitRatio?: string;
  reinvest?: "yes" | "no";
}

interface Props {
  event?: CapitalEvent;
  items: CapitalItem[];
  saving: boolean;
  onBack: () => void;
  onSave: (event: Omit<CapitalEvent, "id">) => void | Promise<void>;
}

export function CapitalEventForm({ event, items, saving, onBack, onSave }: Props) {
  const { locale, t } = useI18n();
  const [form] = Form.useForm<EventFormValues>();
  const itemId = Form.useWatch("itemId", form) ?? event?.itemId ?? items[0]?.id;
  const item = items.find((value) => value.id === itemId);
  const allowedTypes = getCapitalEventTypes(item?.type);
  const type = Form.useWatch("type", form) ?? event?.type ?? allowedTypes[0] ?? "deposit";
  const relatedItemId = Form.useWatch("relatedItemId", form) ?? event?.relatedItemId;
  const visibleTypes = event && !allowedTypes.includes(event.type) ? [...allowedTypes, event.type] : allowedTypes;
  const quantityBased = item?.type === "stock" || item?.type === "fund" || item?.type === "crypto";
  const showQuantity = QUANTITY_TYPES.includes(type) || (["deposit", "withdrawal", "transfer", "adjustment"] as CapitalEventType[]).includes(type) && quantityBased;
  const showAmount = AMOUNT_TYPES.includes(type) || (["deposit", "withdrawal", "transfer", "adjustment"] as CapitalEventType[]).includes(type) && !quantityBased;
  const showUnitPrice = type === "buy" || type === "sell";
  const currencies = type === "transfer" && item ? [item.quoteCurrency] : CAPITAL_CURRENCIES;
  const submit = (values: EventFormValues) => {
    const quantity = showQuantity ? normalizeCapitalDecimal(values.quantity) : undefined;
    const unitPrice = showUnitPrice ? normalizeCapitalDecimal(values.unitPrice) : undefined;
    const amount = unitPrice && quantity
      ? decimalString(multiply(decimal(unitPrice), decimal(quantity)))
      : showAmount ? normalizeCapitalDecimal(values.amount) : undefined;
    return onSave({
      itemId: values.itemId,
      relatedItemId: RELATED_TYPES.includes(values.type) ? values.relatedItemId || undefined : undefined,
      type: values.type,
      status: event?.status ?? "confirmed",
      occurredAt: capitalEventTimestamp(values.occurredAt.format("YYYY-MM-DD"), { existingEvent: event }),
      quantity,
      amount,
      fee: FEE_TYPES.includes(values.type) ? normalizeCapitalDecimal(values.fee) : undefined,
      tax: TAX_TYPES.includes(values.type) ? normalizeCapitalDecimal(values.tax) : undefined,
      splitRatio: values.type === "split" ? normalizeCapitalDecimal(values.splitRatio) : undefined,
      currency: values.currency,
      source: event?.source ?? "manual",
      reinvest: values.type === "interest" && !quantityBased && !values.relatedItemId && values.reinvest === "yes",
      externalProvider: event?.externalProvider,
      externalId: event?.externalId,
    });
  };
  const initialUnitPrice = event?.quantity && event.amount
    ? decimalString(divide(decimal(event.amount), decimal(event.quantity)))
    : undefined;
  const initialValues: EventFormValues = {
    itemId: event?.itemId ?? items[0]?.id ?? "", type: event?.type ?? getCapitalEventTypes(items[0]?.type)[0] ?? "deposit", occurredAt: dayjs(event?.occurredAt ?? undefined),
    relatedItemId: event?.relatedItemId, quantity: event?.quantity, unitPrice: initialUnitPrice,
    amount: event?.amount, currency: event?.currency ?? items[0]?.quoteCurrency ?? "USD",
    fee: event?.fee, tax: event?.tax, splitRatio: event?.splitRatio, reinvest: event?.reinvest ? "yes" : "no",
  };
  const sourceIsMoney = item?.type === "cash" || item?.type === "deposit";
  const relatedItems = type === "transfer"
    ? items.filter((value) => value.id !== itemId && (sourceIsMoney ? value.type === "cash" || value.type === "deposit" : value.quoteCurrency === item?.quoteCurrency && value.type === item?.type && value.symbol === item?.symbol))
    : items.filter((value) => value.id !== itemId && (value.type === "cash" || value.type === "deposit"));
  return <section className="form-page">
    <header className="page-heading"><button type="button" onClick={onBack} aria-label={t("actions.back")}><ArrowLeft size={19}/></button><h1>{t(event ? "capital.event.edit" : "capital.event.new")}</h1></header>
    <Form className="expense-form" form={form} layout="vertical" initialValues={initialValues} onFinish={submit}>
      <Form.Item name="itemId" label={t("capital.asset.title")} rules={[{ required: true }]}><Select onChange={(value) => { const selected = items.find((candidate) => candidate.id === value); form.setFieldValue("currency", selected?.quoteCurrency ?? "USD"); form.setFieldValue("type", getCapitalEventTypes(selected?.type)[0]); form.setFieldValue("relatedItemId", undefined); }} options={items.map((value) => ({ value: value.id, label: value.name }))}/></Form.Item>
      <Form.Item name="type" noStyle><ChoiceGroup label={t("capital.event.type")} options={visibleTypes.map((value) => ({ value, label: getCapitalEventLabel(value, locale) }))} onChange={(value) => { form.setFieldValue("relatedItemId", undefined); if (value === "transfer" && item) form.setFieldValue("currency", item.quoteCurrency); }}/></Form.Item>
      <Form.Item name="occurredAt" label={t("form.date")} rules={[{ required: true }]}><DatePicker allowClear={false}/></Form.Item>
      {RELATED_TYPES.includes(type) ? <Form.Item name="relatedItemId" label={type === "transfer" ? t("capital.event.destination") : t("capital.event.related")} rules={type === "transfer" ? [{ required: true, message: t("capital.validation.destination") }] : []}><Select allowClear options={relatedItems.map((value) => ({ value: value.id, label: value.name }))}/></Form.Item> : null}
      {showQuantity ? <Form.Item name="quantity" label={t("capital.asset.quantity")} rules={[{ validator: (_, value) => (type === "adjustment" ? isNonZeroCapitalDecimal(value) : isPositiveCapitalDecimal(value)) ? Promise.resolve() : Promise.reject(new Error(t("capital.validation.quantity"))) }]}><Input inputMode="decimal"/></Form.Item> : null}
      {showUnitPrice ? <Form.Item name="unitPrice" label={t("capital.asset.purchasePrice")} rules={[{ validator: (_, value) => isPositiveCapitalDecimal(value) ? Promise.resolve() : Promise.reject(new Error(t("capital.validation.positive"))) }]}><Input inputMode="decimal"/></Form.Item> : null}
      {showAmount ? <Form.Item name="amount" label={type === "staking" ? t("capital.event.fairValue") : t("capital.event.amount")} rules={[{ validator: (_, value) => (type === "adjustment" ? isNonZeroCapitalDecimal(value) : isPositiveCapitalDecimal(value)) ? Promise.resolve() : Promise.reject(new Error(t("capital.validation.amount"))) }]}><Input inputMode="decimal"/></Form.Item> : null}
      {type === "split" ? <Form.Item name="splitRatio" label={t("capital.event.splitRatio")} rules={[{ validator: (_, value) => isPositiveCapitalDecimal(value) ? Promise.resolve() : Promise.reject(new Error(t("capital.validation.split"))) }]}><Input inputMode="decimal"/></Form.Item> : null}
      <Form.Item name="currency" noStyle><ChoiceGroup label={t("form.currency")} options={currencies.map((value) => ({ value, label: <><CurrencyIcon currency={value} size={12}/>{value}</> }))}/></Form.Item>
      {FEE_TYPES.includes(type) ? <Form.Item name="fee" label={t("capital.event.fee")} rules={[{ validator: (_, value) => isNonNegativeCapitalDecimal(value) ? Promise.resolve() : Promise.reject(new Error(t("capital.validation.nonNegative"))) }]}><Input inputMode="decimal"/></Form.Item> : null}
      {TAX_TYPES.includes(type) ? <Form.Item name="tax" label={t("capital.event.tax")} rules={[{ validator: (_, value) => isNonNegativeCapitalDecimal(value) ? Promise.resolve() : Promise.reject(new Error(t("capital.validation.nonNegative"))) }]}><Input inputMode="decimal"/></Form.Item> : null}
      {type === "interest" && !quantityBased && !relatedItemId ? <Form.Item name="reinvest" noStyle><ChoiceGroup label={t("capital.event.reinvest")} options={[{ value: "no", label: t("capital.no") }, { value: "yes", label: t("capital.yes") }]}/></Form.Item> : null}
      <button className="primary-action" disabled={saving} type="submit">{t("capital.save")}</button>
    </Form>
  </section>;
}
