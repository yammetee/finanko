import Form from "antd/es/form";
import Input from "antd/es/input";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "../../shared/i18n/i18nContext";
import type { CapitalGroup } from "./capitalTypes";

interface Props {
  group?: CapitalGroup;
  saving: boolean;
  onBack: () => void;
  onSave: (name: string) => void | Promise<void>;
}

export function CapitalGroupForm({ group, saving, onBack, onSave }: Props) {
  const { t } = useI18n();
  return <section className="form-page">
    <header className="page-heading"><button type="button" onClick={onBack} aria-label={t("actions.back")}><ArrowLeft size={19}/></button><h1>{t(group ? "capital.group.edit" : "capital.group.new")}</h1></header>
    <Form className="expense-form capital-form" layout="vertical" initialValues={{ name: group?.name ?? "" }} onFinish={({ name }: { name: string }) => onSave(name.trim())}>
      <Form.Item name="name" label={t("form.name")} rules={[{ required: true, whitespace: true, message: t("capital.validation.name") }]}><Input autoFocus maxLength={120}/></Form.Item>
      <button className="primary-action" disabled={saving} type="submit">{t("capital.save")}</button>
    </Form>
  </section>;
}
