import DatePicker from "antd/es/date-picker";
import Form from "antd/es/form";
import InputNumber from "antd/es/input-number";
import Select from "antd/es/select";
import dayjs from "dayjs";
import { ArrowLeft } from "lucide-react";
import { AppThemeProvider } from "../../app/providers/AppThemeProvider";
import { useI18n } from "../../shared/i18n/i18nContext";
import type { Debt, DebtReconciliation } from "./debtTypes";

type Values = { debtId: string; principalBalance: string; occurredAt: dayjs.Dayjs };
interface Props { reconciliation?: DebtReconciliation; debtId?: string; debts: Debt[]; saving: boolean; onBack: () => void; onSave: (value: Omit<DebtReconciliation, "id" | "sequence" | "type">) => void | Promise<void> }

export function DebtReconciliationForm(props: Props) {
  return <AppThemeProvider><DebtReconciliationFormContent {...props} /></AppThemeProvider>;
}

function DebtReconciliationFormContent({ reconciliation, debtId, debts, saving, onBack, onSave }: Props) {
  const { t } = useI18n();
  const availableDebts = debts.filter((debt) => debt.status === "active" || debt.id === reconciliation?.debtId);
  return <section className="form-page">
    <header className="page-heading"><button type="button" onClick={onBack} aria-label={t("actions.back")}><ArrowLeft size={19}/></button><h1>{t("debt.reconcile.new")}</h1></header>
    <Form<Values> className="expense-form" layout="vertical" initialValues={{ debtId: reconciliation?.debtId ?? debtId ?? availableDebts[0]?.id, principalBalance: reconciliation?.principalBalance ?? "", occurredAt: dayjs(reconciliation?.occurredAt ?? undefined) }} onFinish={(values) => onSave({ debtId: values.debtId, principalBalance: String(values.principalBalance), occurredAt: values.occurredAt.format("YYYY-MM-DD") })}>
      <Form.Item name="debtId" label={t("debt.loan")} rules={[{ required: true, message: t("debt.validation.required") }]}><Select options={availableDebts.map((debt) => ({ value: debt.id, label: debt.name }))}/></Form.Item>
      <Form.Item name="principalBalance" label={t("debt.balance")} rules={[{ required: true, message: t("debt.validation.required") }, { validator: (_, value) => Number(value) >= 0 ? Promise.resolve() : Promise.reject(new Error(t("capital.validation.nonNegative"))) }]}><InputNumber stringMode controls={false}/></Form.Item>
      <Form.Item name="occurredAt" label={t("form.date")} rules={[{ required: true, message: t("debt.validation.required") }]}><DatePicker allowClear={false}/></Form.Item>
      <button className="primary-action" disabled={saving} type="submit">{t("capital.save")}</button>
    </Form>
  </section>;
}
