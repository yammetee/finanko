import Alert from "antd/es/alert";
import DatePicker from "antd/es/date-picker";
import Form from "antd/es/form";
import Input from "antd/es/input";
import InputNumber from "antd/es/input-number";
import Spin from "antd/es/spin";
import { ArrowLeft, Sparkles, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { CURRENCIES } from "../../shared/constants/finance";
import type { MessageKey } from "../../shared/i18n/i18nContext";
import { useI18n } from "../../shared/i18n/i18nContext";
import type { Category } from "../../shared/types/finance";
import { CurrencyIcon } from "../../shared/ui/CurrencyIcon";
import type { ExpenseDraft, ExpenseFormValues } from "./expenseDraft";

export type ExpenseFormMode = "text" | "receipt" | "manual" | "edit";

interface ExpenseFormPageProps {
  mode: ExpenseFormMode;
  draft: ExpenseDraft | null;
  categories: Category[];
  parsing: boolean;
  saving: boolean;
  parseError: string | null;
  onBack: () => void;
  onParseText: (text: string) => void | Promise<void>;
  onSave: (values: ExpenseFormValues) => void | Promise<void>;
}

const warningKeys: Record<string, MessageKey> = {
  cropped: "receipt.warning.cropped", blurred: "receipt.warning.blurred", low_contrast: "receipt.warning.lowContrast",
  unreadable_rows: "receipt.warning.unreadableRows", total_unclear: "receipt.warning.totalUnclear",
  currency_unclear: "receipt.warning.currencyUnclear", low_confidence: "receipt.warning.lowConfidence",
  arithmetic_mismatch: "receipt.warning.arithmeticMismatch", subtotal_mismatch: "receipt.warning.subtotalMismatch",
  totals_mismatch: "receipt.warning.totalsMismatch",
};

export function ExpenseFormPage({ mode, draft, categories, parsing, saving, parseError, onBack, onParseText, onSave }: ExpenseFormPageProps) {
  const { t } = useI18n();
  const [draftForm] = Form.useForm<ExpenseFormValues>();
  const [textForm] = Form.useForm<{ text: string }>();
  const items = Form.useWatch("items", { form: draftForm, preserve: true }) ?? [];

  useEffect(() => { if (draft) draftForm.setFieldsValue(draft as ExpenseFormValues); }, [draft, draftForm]);

  const title = mode === "edit" ? t("expense.editTitle") : mode === "text" && !draft ? t("expense.textTitle") : mode === "receipt" && !draft ? t("expense.receiptTitle") : t("expense.draftTitle");

  return (
    <section className="form-page">
      <header className="page-heading"><button type="button" onClick={onBack} aria-label={t("actions.back")}><ArrowLeft size={19} /></button><h1>{title}</h1></header>
      {mode === "text" && !draft ? (
        <Form className="expense-form" form={textForm} layout="vertical" onFinish={({ text }) => onParseText(text)}>
          <Form.Item name="text" label={t("form.expenseText")} rules={[{ required: true, whitespace: true }]}><Input.TextArea autoFocus autoSize={{ minRows: 5, maxRows: 9 }} placeholder={t("placeholder.expenseText")} /></Form.Item>
          {parseError ? <Alert message={parseError} type="warning" showIcon /> : null}
          <button className="primary-action" disabled={parsing} type="submit"><Sparkles size={16} />{t("actions.parseSmart")}</button>
        </Form>
      ) : null}
      {mode === "receipt" && !draft ? <div className="parsing-state">{parsing ? <Spin /> : null}<span>{parsing ? t("expense.recognizingReceipt") : parseError}</span></div> : null}
      {draft ? (
        <Form className="expense-form" form={draftForm} layout="vertical" onFinish={onSave}>
          {parseError ? <Alert className="form-alert" message={parseError} type="warning" showIcon /> : null}
          {draft.receiptReview ? <Alert className="form-alert" type={draft.receiptReview.requiresReview ? "warning" : "success"} showIcon message={t(draft.receiptReview.requiresReview ? "receipt.reviewRequired" : "receipt.reviewReady")} description={<div className="review-list"><span>{t("receipt.confidence", { value: Math.round(draft.receiptReview.confidence * 100) })}</span>{draft.receiptReview.warnings.map((warning) => <span key={warning}>{t(warningKeys[warning] ?? "receipt.warning.checkFields")}</span>)}</div>} /> : null}
          <Form.Item name="amount" label={t("form.amount")} rules={[{ required: true }, { type: "number", min: 0.01, message: t("expense.amountRequired") }]}><InputNumber autoFocus={mode === "manual"} min={0.01} step={0.01} /></Form.Item>
          <Form.Item name="currency" hidden rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item noStyle shouldUpdate={(before, after) => before.currency !== after.currency}>{({ getFieldValue, setFieldValue }) => <ChoiceGroup label={t("form.currency")} value={getFieldValue("currency")} options={CURRENCIES.map((currency) => ({ value: currency, label: <><CurrencyIcon currency={currency} size={12} />{currency}</> }))} onChange={(value) => setFieldValue("currency", value)} />}</Form.Item>
          <Form.Item name="categoryId" hidden rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item noStyle shouldUpdate={(before, after) => before.categoryId !== after.categoryId}>{({ getFieldValue, setFieldValue }) => <ChoiceGroup label={t("expense.category")} value={getFieldValue("categoryId")} options={categories.map((category) => ({ value: category.id, label: category.name }))} onChange={(value) => setFieldValue("categoryId", value)} />}</Form.Item>
          <Form.Item name="description" label={t("form.description")}><Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} /></Form.Item>
          <Form.Item name="occurredAt" label={t("form.date")} rules={[{ required: true }]}><DatePicker allowClear={false} /></Form.Item>
          <Form.Item name="source" hidden><Input /></Form.Item>
          {items.length > 0 ? (
            <section className="parsed-items"><h2>{t("section.parsedItems")}</h2><Form.List name="items">{(fields, { remove }) => fields.map((field) => (
              <div className="parsed-item" key={field.key}>
                <Form.Item name={[field.name, "id"]} hidden><Input /></Form.Item>
                <div className="parsed-name"><Form.Item name={[field.name, "name"]} rules={[{ required: true }]}><Input placeholder={t("form.name")} /></Form.Item><button type="button" onClick={() => remove(field.name)} aria-label={t("actions.delete")}><Trash2 size={15} /></button></div>
                <Form.Item name={[field.name, "amount"]} label={t("form.amount")} rules={[{ required: true }]}><InputNumber step={0.01} /></Form.Item>
                <Form.Item name={[field.name, "categoryId"]} hidden rules={[{ required: true }]}><Input /></Form.Item>
                <Form.Item noStyle shouldUpdate>{() => <ChoiceGroup label={t("expense.category")} value={draftForm.getFieldValue(["items", field.name, "categoryId"])} options={categories.map((category) => ({ value: category.id, label: category.name }))} onChange={(value) => draftForm.setFieldValue(["items", field.name, "categoryId"], value)} />}</Form.Item>
                <Form.Item name={[field.name, "quantity"]} hidden><InputNumber /></Form.Item><Form.Item name={[field.name, "unitPrice"]} hidden><InputNumber /></Form.Item><Form.Item name={[field.name, "confidence"]} hidden><InputNumber /></Form.Item>
              </div>
            ))}</Form.List></section>
          ) : null}
          <button className="primary-action" disabled={saving} type="submit">{t(mode === "edit" ? "expense.saveChanges" : "expense.save")}</button>
        </Form>
      ) : null}
    </section>
  );
}

interface ChoiceGroupProps { label: string; value?: string; options: Array<{ value: string; label: React.ReactNode }>; onChange: (value: string) => void; }
function ChoiceGroup({ label, value, options, onChange }: ChoiceGroupProps) {
  return <div className="choice-group"><span>{label}</span><div>{options.map((option) => <button className={value === option.value ? "active" : ""} key={option.value} type="button" onClick={() => onChange(option.value)}>{option.label}</button>)}</div></div>;
}
