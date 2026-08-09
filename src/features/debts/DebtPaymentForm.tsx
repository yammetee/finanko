import DatePicker from "antd/es/date-picker";
import Form from "antd/es/form";
import InputNumber from "antd/es/input-number";
import Select from "antd/es/select";
import dayjs from "dayjs";
import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";
import { AppThemeProvider } from "../../app/providers/AppThemeProvider";
import { useI18n } from "../../shared/i18n/i18nContext";
import { decimal } from "../../shared/lib/decimal";
import { formatMoney } from "../../shared/lib/format";
import { ChoiceGroup } from "../../shared/ui/ChoiceGroup";
import { buildDebtProjection, calculatePayoffAmount, previewEarlyRepayment } from "./debtMath";
import type { Debt, DebtEvent, DebtPayment, DebtPaymentStrategy } from "./debtTypes";

type Values = { debtId: string; amount: string; occurredAt: dayjs.Dayjs; strategy: DebtPaymentStrategy };
interface Props { payment?: DebtPayment; debts: Debt[]; events: DebtEvent[]; saving: boolean; onBack: () => void; onSave: (value: Omit<DebtPayment, "id" | "sequence" | "type">) => void | Promise<void> }

function isGreaterThan(left?: string, right?: string) {
  try { return Boolean(left && right && decimal(left) > decimal(right)); }
  catch { return false; }
}

export function DebtPaymentForm(props: Props) {
  return <AppThemeProvider><DebtPaymentFormContent {...props} /></AppThemeProvider>;
}

function DebtPaymentFormContent({ payment, debts, events, saving, onBack, onSave }: Props) {
  const { t } = useI18n();
  const [form] = Form.useForm<Values>();
  const availableDebts = debts.filter((debt) => debt.status === "active" || debt.id === payment?.debtId);
  const debtId = Form.useWatch("debtId", form);
  const amount = Form.useWatch("amount", form);
  const occurredAt = Form.useWatch("occurredAt", form);
  const strategy = Form.useWatch("strategy", form);
  const selected = availableDebts.find((debt) => debt.id === debtId) ?? availableDebts[0];
  const payoff = selected && occurredAt ? calculatePayoffAmount(selected, events, occurredAt.format("YYYY-MM-DD")) : undefined;
  const oversized = selected ? isGreaterThan(amount, selected.requiredPayment) : false;
  const strategies = oversized
    ? [{ value: "reduce_term", label: t("debt.strategy.reduceTerm") }, { value: "reduce_payment", label: t("debt.strategy.reducePayment") }, { value: "full", label: t("debt.strategy.full") }]
    : [{ value: "scheduled", label: t("debt.strategy.scheduled") }, { value: "full", label: t("debt.strategy.full") }];
  const preview = useMemo(() => {
    if (!selected || !amount || !occurredAt || Number(amount) <= 0) return undefined;
    try {
      const draft: DebtPayment = { id: payment?.id ?? "preview", debtId: selected.id, type: "payment", amount: String(amount), occurredAt: `${occurredAt.format("YYYY-MM-DD")}T12:00:00.000Z`, sequence: payment?.sequence ?? 999999, strategy: strategy ?? (oversized ? "reduce_term" : "scheduled") };
      const projection = buildDebtProjection(selected, [...events.filter((event) => event.id !== payment?.id), draft], occurredAt.format("YYYY-MM-DD"));
      const breakdown = projection.payments.find((entry) => entry.eventId === draft.id);
      const early = oversized && draft.strategy !== "scheduled" ? previewEarlyRepayment(selected, events, draft) : undefined;
      return breakdown ? { breakdown, early } : undefined;
    } catch { return undefined; }
  }, [amount, events, occurredAt, oversized, payment, selected, strategy]);
  return <section className="form-page">
    <header className="page-heading"><button type="button" onClick={onBack} aria-label={t("actions.back")}><ArrowLeft size={19}/></button><h1>{t(payment ? "debt.payment.edit" : "debt.payment.new")}</h1></header>
    <Form<Values> form={form} className="expense-form" layout="vertical" initialValues={{ debtId: payment?.debtId ?? availableDebts[0]?.id, amount: payment?.amount ?? "", occurredAt: dayjs(payment?.occurredAt ?? undefined), strategy: payment?.strategy ?? "scheduled" }} onValuesChange={(changed, values) => { if ("amount" in changed || "debtId" in changed) { const debt = availableDebts.find((entry) => entry.id === values.debtId); form.setFieldValue("strategy", isGreaterThan(String(values.amount ?? ""), debt?.requiredPayment) ? "reduce_term" : "scheduled"); } if (changed.strategy === "full" && payoff) form.setFieldValue("amount", payoff); }} onFinish={(values) => onSave({ debtId: values.debtId, amount: String(values.amount), occurredAt: values.occurredAt.format("YYYY-MM-DD"), strategy: values.strategy })}>
      <Form.Item name="debtId" label={t("debt.loan")} rules={[{ required: true, message: t("debt.validation.required") }]}><Select options={availableDebts.map((debt) => ({ value: debt.id, label: debt.name }))}/></Form.Item>
      <Form.Item name="amount" label={t("capital.event.amount")} rules={[{ required: true, message: t("debt.validation.required") }, { validator: (_, value) => Number(value) > 0 ? Promise.resolve() : Promise.reject(new Error(t("debt.validation.positive"))) }]}><InputNumber stringMode controls={false}/></Form.Item>
      <Form.Item name="occurredAt" label={t("form.date")} rules={[{ required: true, message: t("debt.validation.required") }]}><DatePicker allowClear={false}/></Form.Item>
      <Form.Item name="strategy" noStyle><ChoiceGroup label={t("debt.strategy")} options={strategies}/></Form.Item>
      {preview && selected ? <dl className="details-list"><div><dt>{t("debt.interestPart")}</dt><dd>{formatMoney(Number(preview.breakdown.interest), selected.currency)}</dd></div><div><dt>{t("debt.principalPart")}</dt><dd>{formatMoney(Number(preview.breakdown.scheduledPrincipal) + Number(preview.breakdown.earlyPrincipal), selected.currency)}</dd></div><div><dt>{t("debt.afterPayment")}</dt><dd>{formatMoney(Number(preview.breakdown.principalAfter), selected.currency)}</dd></div>{preview.early ? <><div><dt>{t("debt.paymentAfter")}</dt><dd>{formatMoney(Number(preview.early.requiredPaymentAfter), selected.currency)}</dd></div><div><dt>{t("debt.payoffDateAfter")}</dt><dd>{preview.early.payoffDateAfter ?? "—"}</dd></div><div><dt>{t("debt.remainingInterest")}</dt><dd>{formatMoney(Number(preview.early.projection.futureInterest), selected.currency)}</dd></div><div><dt>{t("debt.interestSaved")}</dt><dd className="positive">{formatMoney(Number(preview.early.interestSaved), selected.currency)}</dd></div></> : null}</dl> : null}
      <button className="primary-action" disabled={saving} type="submit">{t("capital.save")}</button>
    </Form>
  </section>;
}
