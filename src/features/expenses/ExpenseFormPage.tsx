import Alert from "antd/es/alert";
import DatePicker from "antd/es/date-picker";
import Form from "antd/es/form";
import Input from "antd/es/input";
import InputNumber from "antd/es/input-number";
import Spin from "antd/es/spin";
import { ArrowLeft, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { CURRENCIES } from "../../shared/constants/expenses";
import { getCategoryName } from "../../shared/i18n/displayText";
import type { MessageKey } from "../../shared/i18n/i18nContext";
import { useI18n } from "../../shared/i18n/i18nContext";
import { formatMoney } from "../../shared/lib/format";
import type { Category, Currency } from "../../shared/types/expense";
import { CurrencyIcon } from "../../shared/ui/CurrencyIcon";
import { ChoiceGroup } from "../../shared/ui/ChoiceGroup";
import { calculateExpenseItemsTotal, type ExpenseDraft, type ExpenseFormValues } from "./expenseDraft";

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
  const currency = Form.useWatch("currency", { form: draftForm, preserve: true }) as Currency | undefined;
  const occurredAt = Form.useWatch("occurredAt", { form: draftForm, preserve: true });
  const totalCurrency = currency ?? draft?.currency ?? "USD";
  const itemsTotal = calculateExpenseItemsTotal(items, totalCurrency, occurredAt?.toISOString?.());

  useEffect(() => { if (draft) draftForm.setFieldsValue(draft as ExpenseFormValues); }, [draft, draftForm]);

  const title = mode === "edit" ? t("expense.editTitle") : mode === "text" && !draft ? t("expense.textTitle") : mode === "receipt" && !draft ? t("expense.receiptTitle") : t("expense.draftTitle");

  return (
    <section className="form-page">
      <header className="page-heading"><button type="button" onClick={onBack} aria-label={t("actions.back")}><ArrowLeft size={19} /></button><h1>{title}</h1></header>
      {mode === "text" && !draft ? (
        <Form className="expense-form" form={textForm} layout="vertical" onFinish={({ text }) => onParseText(text)}>
          <Form.Item name="text" label={t("form.expenseText")} rules={[{ required: true, whitespace: true, message: t("expense.textRequired") }]}><Input.TextArea autoFocus autoSize={{ minRows: 5, maxRows: 9 }} placeholder={t("placeholder.expenseText")} /></Form.Item>
          {parseError ? <Alert message={parseError} type="warning" showIcon /> : null}
          <button className="primary-action" disabled={parsing} type="submit"><Sparkles size={16} />{t("actions.parseSmart")}</button>
        </Form>
      ) : null}
      {mode === "receipt" && !draft ? <div className="parsing-state">{parsing ? <Spin /> : null}<span>{parsing ? t("expense.recognizingReceipt") : parseError}</span></div> : null}
      {draft ? (
        <Form className="expense-form" form={draftForm} layout="vertical" onFinish={onSave}>
          {parseError ? <Alert className="form-alert" message={parseError} type="warning" showIcon /> : null}
          {draft.receiptReview ? <Alert className="form-alert" type={draft.receiptReview.requiresReview ? "warning" : "success"} showIcon message={t(draft.receiptReview.requiresReview ? "receipt.reviewRequired" : "receipt.reviewReady")} description={<div className="review-list"><span>{t("receipt.confidence", { value: Math.round(draft.receiptReview.confidence * 100) })}</span>{draft.receiptReview.warnings.map((warning) => <span key={warning}>{t(warningKeys[warning] ?? "receipt.warning.checkFields")}</span>)}</div>} /> : null}
          <div className="draft-total"><span>{t("expense.total")}</span><strong>{formatMoney(itemsTotal, totalCurrency)}</strong></div>
          <Form.Item name="currency" noStyle rules={[{ required: true, message: t("expense.currencyRequired") }]}><ChoiceGroup label={t("form.totalCurrency")} options={CURRENCIES.map((currency) => ({ value: currency, label: <><CurrencyIcon currency={currency} size={12} />{currency}</> }))} /></Form.Item>
          <Form.List name="items" rules={[{ validator: async (_, value) => value?.length ? undefined : Promise.reject(new Error(t("expense.itemRequired"))) }]}>{(fields, { add, remove }, { errors }) => (
            <>
              {fields.length > 0 ? <section className="parsed-items"><h2>{t("section.parsedItems")}</h2>{fields.map((field) => (
                <div className="parsed-item" key={field.key}>
                  <div className="parsed-name"><Form.Item name={[field.name, "name"]} rules={[{ required: true, message: t("expense.nameRequired") }]}><Input autoFocus={mode === "manual" && field.name === 0} placeholder={t("form.name")} /></Form.Item><button type="button" onClick={() => remove(field.name)} aria-label={t("actions.delete")}><Trash2 size={15} /></button></div>
                  <Form.Item name={[field.name, "amount"]} label={t("form.price")} rules={[{ required: true, message: t("expense.amountRequired") }, { type: "number", min: 0.01, message: t("expense.amountRequired") }]}><InputNumber min={0.01} step={0.01} /></Form.Item>
                  <Form.Item name={[field.name, "currency"]} noStyle rules={[{ required: true, message: t("expense.currencyRequired") }]}><ChoiceGroup label={t("form.itemCurrency")} options={CURRENCIES.map((itemCurrency) => ({ value: itemCurrency, label: <><CurrencyIcon currency={itemCurrency} size={12} />{itemCurrency}</> }))} /></Form.Item>
                  <Form.Item name={[field.name, "categoryId"]} noStyle rules={[{ required: true, message: t("expense.categoryRequired") }]}><ChoiceGroup label={t("expense.category")} options={categories.map((category) => ({ value: category.id, label: getCategoryName(category, t) }))} /></Form.Item>
                </div>
              ))}</section> : null}
              <Form.ErrorList errors={errors} />
              {mode !== "edit" ? <button className="add-item-button" type="button" onClick={() => add({ name: "", currency: totalCurrency, categoryId: categories[0]?.id })}><Plus size={15} />{t("actions.addItem")}</button> : null}
            </>
          )}</Form.List>
          <Form.Item name="occurredAt" label={t("form.date")} rules={[{ required: true, message: t("expense.dateRequired") }]}><DatePicker allowClear={false} /></Form.Item>
          <Form.Item name="source" hidden><Input /></Form.Item>
          <button className="primary-action" disabled={saving} type="submit">{t(mode === "edit" ? "expense.saveChanges" : "expense.save")}</button>
        </Form>
      ) : null}
    </section>
  );
}
