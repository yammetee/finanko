import DatePicker from "antd/es/date-picker";
import Form from "antd/es/form";
import Input from "antd/es/input";
import InputNumber from "antd/es/input-number";
import Select from "antd/es/select";
import dayjs from "dayjs";
import { ArrowLeft } from "lucide-react";
import { AppThemeProvider } from "../../app/providers/AppThemeProvider";
import { CURRENCIES } from "../../shared/constants/expenses";
import { useI18n } from "../../shared/i18n/i18nContext";
import { decimal, decimalString, divide, multiply } from "../../shared/lib/decimal";
import { ChoiceGroup } from "../../shared/ui/ChoiceGroup";
import { CurrencyIcon } from "../../shared/ui/CurrencyIcon";
import type { Debt, DebtGroup } from "./debtTypes";

type Values = { groupId: string; name: string; lender?: string; loanType: Debt["loanType"]; currency: Debt["currency"]; principalBalance: string; annualRate: string; requiredPayment: string; balanceDate: dayjs.Dayjs; nextPaymentDate: dayjs.Dayjs; remainingPayments: number };
interface Props { debt?: Debt; groups: DebtGroup[]; saving: boolean; onBack: () => void; onSave: (value: Omit<Debt, "id">) => void | Promise<void> }

export function DebtForm(props: Props) {
  return <AppThemeProvider><DebtFormContent {...props} /></AppThemeProvider>;
}

function DebtFormContent({ debt, groups, saving, onBack, onSave }: Props) {
  const { t } = useI18n();
  const required = [{ required: true, message: t("debt.validation.required") }];
  const positive = [...required, { validator: (_: unknown, value?: string | number) => Number(value) > 0 ? Promise.resolve() : Promise.reject(new Error(t("debt.validation.positive"))) }];
  const initialValues: Values = debt ? {
    ...debt, lender: debt.lender, annualRate: decimalString(multiply(decimal(debt.annualRate), decimal("100"))),
    balanceDate: dayjs(debt.balanceDate), nextPaymentDate: dayjs(debt.nextPaymentDate),
  } : {
    groupId: groups[0]?.id, name: "", lender: "", loanType: "consumer", currency: "RUB",
    principalBalance: "", annualRate: "", requiredPayment: "", balanceDate: dayjs(), nextPaymentDate: dayjs().add(1, "month"), remainingPayments: 12,
  };
  return <section className="form-page">
    <header className="page-heading"><button type="button" onClick={onBack} aria-label={t("actions.back")}><ArrowLeft size={19}/></button><h1>{t(debt ? "debt.loan.edit" : "debt.loan.new")}</h1></header>
    <Form<Values> className="expense-form" layout="vertical" initialValues={initialValues} onFinish={(values) => onSave({
      groupId: values.groupId, name: values.name.trim(), lender: values.lender?.trim() || undefined,
      loanType: values.loanType, currency: values.currency, principalBalance: String(values.principalBalance),
      annualRate: decimalString(divide(decimal(String(values.annualRate)), decimal("100"))), requiredPayment: String(values.requiredPayment),
      balanceDate: values.balanceDate.format("YYYY-MM-DD"), nextPaymentDate: values.nextPaymentDate.format("YYYY-MM-DD"),
      remainingPayments: Number(values.remainingPayments), status: debt?.status ?? "active",
    })}>
      <Form.Item name="name" label={t("form.name")} rules={required}><Input autoFocus maxLength={160}/></Form.Item>
      <Form.Item name="groupId" label={t("debt.group")} rules={required}><Select options={groups.map((group) => ({ value: group.id, label: group.name }))}/></Form.Item>
      <Form.Item name="lender" label={t("debt.lender")}><Input maxLength={160}/></Form.Item>
      <Form.Item name="loanType" noStyle><ChoiceGroup label={t("debt.type")} options={[{ value: "consumer", label: t("debt.consumer") }, { value: "mortgage", label: t("debt.mortgage") }]}/></Form.Item>
      <Form.Item name="currency" noStyle><ChoiceGroup label={t("form.currency")} options={CURRENCIES.map((currency) => ({ value: currency, label: <><CurrencyIcon currency={currency} size={12}/>{currency}</> }))}/></Form.Item>
      <Form.Item name="principalBalance" label={t("debt.balance")} rules={positive}><InputNumber stringMode controls={false}/></Form.Item>
      <Form.Item name="annualRate" label={t("debt.rate")} rules={positive}><InputNumber stringMode controls={false}/></Form.Item>
      <Form.Item name="requiredPayment" label={t("debt.requiredPayment")} rules={positive}><InputNumber stringMode controls={false}/></Form.Item>
      <Form.Item name="balanceDate" label={t("debt.balanceDate")} rules={required}><DatePicker allowClear={false}/></Form.Item>
      <Form.Item name="nextPaymentDate" label={t("debt.nextPayment")} rules={required}><DatePicker allowClear={false}/></Form.Item>
      <Form.Item name="remainingPayments" label={t("debt.remainingPayments")} rules={positive}><InputNumber controls={false} precision={0}/></Form.Item>
      <button className="primary-action" disabled={saving} type="submit">{t("capital.save")}</button>
    </Form>
  </section>;
}
