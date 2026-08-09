import Form from "antd/es/form";
import Input from "antd/es/input";
import { ArrowLeft } from "lucide-react";
import { AppThemeProvider } from "../../app/providers/AppThemeProvider";
import { useI18n } from "../../shared/i18n/i18nContext";
import type { DebtGroup } from "./debtTypes";

interface Props { group?: DebtGroup; saving: boolean; onBack: () => void; onSave: (name: string) => void | Promise<void> }

export function DebtGroupForm(props: Props) {
  return <AppThemeProvider><DebtGroupFormContent {...props} /></AppThemeProvider>;
}

function DebtGroupFormContent({ group, saving, onBack, onSave }: Props) {
  const { t } = useI18n();
  return <section className="form-page">
    <header className="page-heading"><button type="button" onClick={onBack} aria-label={t("actions.back")}><ArrowLeft size={19}/></button><h1>{t(group ? "debt.group.edit" : "debt.group.new")}</h1></header>
    <Form className="expense-form" layout="vertical" initialValues={{ name: group?.name ?? "" }} onFinish={({ name }: { name: string }) => onSave(name.trim())}>
      <Form.Item name="name" label={t("form.name")} rules={[{ required: true, whitespace: true, message: t("debt.validation.required") }]}><Input autoFocus maxLength={120}/></Form.Item>
      <button className="primary-action" disabled={saving} type="submit">{t("capital.save")}</button>
    </Form>
  </section>;
}
