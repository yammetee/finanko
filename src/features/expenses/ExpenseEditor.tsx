import Alert from "antd/es/alert";
import DatePicker from "antd/es/date-picker";
import Form from "antd/es/form";
import Input from "antd/es/input";
import InputNumber from "antd/es/input-number";
import Select from "antd/es/select";
import Spin from "antd/es/spin";
import { ArrowLeft, Sparkles, Trash2 } from "lucide-react";
import { useEffect } from "react";
import type { MessageKey } from "../../shared/i18n/i18nContext";
import { useI18n } from "../../shared/i18n/i18nContext";
import type { Category } from "../../shared/types/finance";
import { CurrencySelect } from "../../shared/ui/FormSelects";
import type { ExpenseDraft, ExpenseFormValues } from "./expenseDraft";

export type ExpenseEditorMode = "text" | "receipt" | "manual" | "edit";

interface ExpenseEditorProps {
  mode: ExpenseEditorMode;
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
  cropped: "receipt.warning.cropped",
  blurred: "receipt.warning.blurred",
  low_contrast: "receipt.warning.lowContrast",
  unreadable_rows: "receipt.warning.unreadableRows",
  total_unclear: "receipt.warning.totalUnclear",
  currency_unclear: "receipt.warning.currencyUnclear",
  low_confidence: "receipt.warning.lowConfidence",
  arithmetic_mismatch: "receipt.warning.arithmeticMismatch",
  subtotal_mismatch: "receipt.warning.subtotalMismatch",
  totals_mismatch: "receipt.warning.totalsMismatch",
};

export function ExpenseEditor({
  mode,
  draft,
  categories,
  parsing,
  saving,
  parseError,
  onBack,
  onParseText,
  onSave,
}: ExpenseEditorProps) {
  const { t } = useI18n();
  const [draftForm] = Form.useForm<ExpenseFormValues>();
  const [textForm] = Form.useForm<{ text: string }>();
  const items = Form.useWatch("items", { form: draftForm, preserve: true }) ?? [];

  useEffect(() => {
    if (draft) draftForm.setFieldsValue(draft as ExpenseFormValues);
  }, [draft, draftForm]);

  const title = mode === "edit"
    ? t("expense.editTitle")
    : mode === "text" && !draft
      ? t("expense.textTitle")
      : mode === "receipt" && !draft
        ? t("expense.receiptTitle")
        : t("expense.draftTitle");
  const categoryOptions = categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));

  return (
    <div className="editor-screen">
      <header className="screen-titlebar">
        <button className="bare-icon-button" type="button" onClick={onBack} aria-label={t("actions.back")}>
          <ArrowLeft size={20} />
        </button>
        <h1>{title}</h1>
      </header>

      {mode === "text" && !draft ? (
        <Form className="editor-form" form={textForm} layout="vertical" onFinish={({ text }) => onParseText(text)}>
          <Form.Item name="text" label={t("form.expenseText")} rules={[{ required: true, whitespace: true }]}>
            <Input.TextArea autoFocus autoSize={{ minRows: 5, maxRows: 9 }} placeholder={t("placeholder.expenseText")} />
          </Form.Item>
          {parseError ? <Alert message={parseError} type="warning" showIcon /> : null}
          <button className="solid-action" disabled={parsing} type="submit">
            <Sparkles size={17} />
            {t("actions.parseSmart")}
          </button>
        </Form>
      ) : null}

      {mode === "receipt" && !draft ? (
        <div className="recognition-state" aria-live="polite">
          {parsing ? <Spin /> : null}
          <span>{parsing ? t("expense.recognizingReceipt") : parseError}</span>
        </div>
      ) : null}

      {draft ? (
        <Form className="editor-form" form={draftForm} layout="vertical" onFinish={onSave}>
          {parseError ? <Alert className="form-notice" message={parseError} type="warning" showIcon /> : null}
          {draft.receiptReview ? (
            <Alert
              className="form-notice"
              type={draft.receiptReview.requiresReview ? "warning" : "success"}
              showIcon
              message={t(draft.receiptReview.requiresReview ? "receipt.reviewRequired" : "receipt.reviewReady")}
              description={(
                <div className="review-lines">
                  <span>{t("receipt.confidence", { value: Math.round(draft.receiptReview.confidence * 100) })}</span>
                  {draft.receiptReview.warnings.map((warning) => (
                    <span key={warning}>{t(warningKeys[warning] ?? "receipt.warning.checkFields")}</span>
                  ))}
                </div>
              )}
            />
          ) : null}

          <div className="amount-fields">
            <Form.Item
              name="amount"
              label={t("form.amount")}
              rules={[{ required: true }, { type: "number", min: 0.01, message: t("expense.amountRequired") }]}
            >
              <InputNumber autoFocus={mode === "manual"} min={0.01} step={0.01} />
            </Form.Item>
            <Form.Item name="currency" label={t("form.currency")} rules={[{ required: true }]}>
              <CurrencySelect />
            </Form.Item>
          </div>

          <Form.Item name="categoryId" label={t("expense.category")} rules={[{ required: true }]}>
            <Select options={categoryOptions} />
          </Form.Item>
          <Form.Item name="description" label={t("form.description")}>
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
          </Form.Item>
          <Form.Item name="occurredAt" label={t("form.date")} rules={[{ required: true }]}>
            <DatePicker allowClear={false} />
          </Form.Item>
          <Form.Item name="source" hidden><Input /></Form.Item>

          {items.length > 0 ? (
            <section className="parsed-items">
              <h2>{t("section.parsedItems")}</h2>
              <Form.List name="items">
                {(fields, { remove }) => fields.map((field) => (
                  <div className="parsed-item" key={field.key}>
                    <Form.Item name={[field.name, "id"]} hidden><Input /></Form.Item>
                    <div className="parsed-item-name">
                      <Form.Item name={[field.name, "name"]} rules={[{ required: true }]}>
                        <Input aria-label={t("form.name")} placeholder={t("form.name")} />
                      </Form.Item>
                      <button className="bare-icon-button danger-text" type="button" onClick={() => remove(field.name)} aria-label={t("actions.delete")}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="parsed-item-fields">
                      <Form.Item name={[field.name, "amount"]} label={t("form.amount")} rules={[{ required: true }]}>
                        <InputNumber step={0.01} />
                      </Form.Item>
                      <Form.Item name={[field.name, "categoryId"]} label={t("expense.category")} rules={[{ required: true }]}>
                        <Select options={categoryOptions} />
                      </Form.Item>
                    </div>
                    <Form.Item name={[field.name, "quantity"]} hidden><InputNumber /></Form.Item>
                    <Form.Item name={[field.name, "unitPrice"]} hidden><InputNumber /></Form.Item>
                    <Form.Item name={[field.name, "confidence"]} hidden><InputNumber /></Form.Item>
                  </div>
                ))}
              </Form.List>
            </section>
          ) : null}

          <button className="solid-action" disabled={saving} type="submit">
            {t(mode === "edit" ? "expense.saveChanges" : "expense.save")}
          </button>
        </Form>
      ) : null}
    </div>
  );
}
