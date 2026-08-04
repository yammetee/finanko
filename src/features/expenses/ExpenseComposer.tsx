import Alert from "antd/es/alert";
import Button from "antd/es/button";
import DatePicker from "antd/es/date-picker";
import Drawer from "antd/es/drawer";
import Form from "antd/es/form";
import Input from "antd/es/input";
import InputNumber from "antd/es/input-number";
import Select from "antd/es/select";
import Space from "antd/es/space";
import Spin from "antd/es/spin";
import Typography from "antd/es/typography";
import { Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { MessageKey } from "../../shared/i18n/i18nContext";
import { useI18n } from "../../shared/i18n/i18nContext";
import { CurrencySelect } from "../../shared/ui/FormSelects";
import type {
  Category,
} from "../../shared/types/finance";
import type { ExpenseDraft, ExpenseFormValues } from "./expenseDraft";

const { Text } = Typography;

export type ExpenseInputMode = "text" | "receipt" | "manual" | "edit";

interface ExpenseComposerProps {
  open: boolean;
  mode: ExpenseInputMode;
  draft: ExpenseDraft | null;
  categories: Category[];
  parsing: boolean;
  saving: boolean;
  parseError: string | null;
  onClose: () => void;
  onParseText: (text: string) => void | Promise<void>;
  onSave: (values: ExpenseFormValues) => void | Promise<void>;
}

const receiptWarningKeys: Record<string, MessageKey> = {
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

function useMobileComposer() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const update = () => setIsMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isMobile;
}

export function ExpenseComposer({
  open,
  mode,
  draft,
  categories,
  parsing,
  saving,
  parseError,
  onClose,
  onParseText,
  onSave,
}: ExpenseComposerProps) {
  const { t } = useI18n();
  const isMobile = useMobileComposer();
  const [form] = Form.useForm<ExpenseFormValues>();
  const [textForm] = Form.useForm<{ text: string }>();
  const items = Form.useWatch("items", { form, preserve: true }) ?? [];

  useEffect(() => {
    if (draft) form.setFieldsValue(draft as ExpenseFormValues);
  }, [draft, form]);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      textForm.resetFields();
    }
  }, [form, open, textForm]);

  const categoryOptions = categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));
  const title = mode === "edit"
    ? t("expense.editTitle")
    : mode === "text" && !draft
      ? t("expense.textTitle")
      : mode === "receipt" && !draft
        ? t("expense.receiptTitle")
        : t("expense.draftTitle");

  return (
    <Drawer
      className="expense-composer"
      placement={isMobile ? "bottom" : "right"}
      height={isMobile ? "100%" : undefined}
      width={isMobile ? undefined : 520}
      open={open}
      onClose={onClose}
      title={title}
      footer={draft ? (
        <Button
          block
          className="expense-primary-action"
          loading={saving}
          type="primary"
          onClick={() => form.submit()}
        >
          {t(mode === "edit" ? "expense.saveChanges" : "expense.save")}
        </Button>
      ) : mode === "text" ? (
        <Button
          block
          className="expense-primary-action"
          icon={<Sparkles size={17} />}
          loading={parsing}
          type="primary"
          onClick={() => textForm.submit()}
        >
          {t("actions.parseSmart")}
        </Button>
      ) : null}
    >
      {mode === "text" && !draft ? (
        <Form
          className="expense-text-form"
          form={textForm}
          layout="vertical"
          onFinish={({ text }) => onParseText(text)}
        >
          <Form.Item
            name="text"
            label={t("form.expenseText")}
            rules={[{ required: true, whitespace: true }]}
          >
            <Input.TextArea
              autoFocus
              autoSize={{ minRows: 5, maxRows: 10 }}
              placeholder={t("placeholder.expenseText")}
            />
          </Form.Item>
          {parseError ? <Alert message={parseError} type="warning" showIcon /> : null}
        </Form>
      ) : null}

      {mode === "receipt" && !draft ? (
        <div className="expense-parsing-state" aria-live="polite">
          {parsing ? <Spin size="large" /> : null}
          <Text>{parsing ? t("expense.recognizingReceipt") : parseError}</Text>
        </div>
      ) : null}

      {draft ? (
        <Form
          className="expense-draft-form"
          form={form}
          layout="vertical"
          onFinish={onSave}
        >
          {parseError ? <Alert className="expense-alert" message={parseError} type="warning" showIcon /> : null}
          {draft.receiptReview ? (
            <Alert
              className="expense-alert"
              type={draft.receiptReview.requiresReview ? "warning" : "success"}
              showIcon
              message={t(
                draft.receiptReview.requiresReview
                  ? "receipt.reviewRequired"
                  : "receipt.reviewReady",
              )}
              description={(
                <Space direction="vertical" size={5}>
                  <Text>
                    {t("receipt.confidence", {
                      value: Math.round(draft.receiptReview.confidence * 100),
                    })}
                  </Text>
                  {draft.receiptReview.warnings.map((warning) => (
                    <Text className="receipt-review-warning" key={warning}>
                      {t(receiptWarningKeys[warning] ?? "receipt.warning.checkFields")}
                    </Text>
                  ))}
                </Space>
              )}
            />
          ) : null}

          <div className="expense-form-grid">
            <Form.Item
              name="amount"
              label={t("form.amount")}
              rules={[
                { required: true },
                { type: "number", min: 0.01, message: t("expense.amountRequired") },
              ]}
            >
              <InputNumber autoFocus={mode === "manual"} min={0.01} step={0.01} />
            </Form.Item>
            <Form.Item name="currency" label={t("form.currency")} rules={[{ required: true }]}>
              <CurrencySelect />
            </Form.Item>
          </div>

          <Form.Item
            name="categoryId"
            label={t("expense.category")}
            rules={[{ required: true }]}
          >
            <Select options={categoryOptions} />
          </Form.Item>
          <Form.Item name="description" label={t("form.description")}>
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} />
          </Form.Item>
          <Form.Item name="occurredAt" label={t("form.date")} rules={[{ required: true }]}>
            <DatePicker allowClear={false} />
          </Form.Item>
          <Form.Item name="source" hidden>
            <Input />
          </Form.Item>

          {items.length > 0 ? (
            <section className="expense-items-section">
              <div className="expense-section-title">{t("section.parsedItems")}</div>
              <Form.List name="items">
                {(fields, { remove }) => (
                  <div className="expense-items-list">
                    {fields.map((field) => (
                      <div className="expense-item-card" key={field.key}>
                        <Form.Item name={[field.name, "id"]} hidden><Input /></Form.Item>
                        <div className="expense-item-name-row">
                          <Form.Item
                            name={[field.name, "name"]}
                            rules={[{ required: true }]}
                          >
                            <Input aria-label={t("form.name")} placeholder={t("form.name")} />
                          </Form.Item>
                          <Button
                            aria-label={t("actions.delete")}
                            danger
                            icon={<Trash2 size={16} />}
                            type="text"
                            onClick={() => remove(field.name)}
                          />
                        </div>
                        <div className="expense-item-fields">
                          <Form.Item
                            name={[field.name, "amount"]}
                            label={t("form.amount")}
                            rules={[{ required: true }]}
                          >
                            <InputNumber step={0.01} />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, "categoryId"]}
                            label={t("expense.category")}
                            rules={[{ required: true }]}
                          >
                            <Select options={categoryOptions} />
                          </Form.Item>
                        </div>
                        <Form.Item name={[field.name, "quantity"]} hidden><InputNumber /></Form.Item>
                        <Form.Item name={[field.name, "unitPrice"]} hidden><InputNumber /></Form.Item>
                        <Form.Item name={[field.name, "confidence"]} hidden><InputNumber /></Form.Item>
                      </div>
                    ))}
                  </div>
                )}
              </Form.List>
            </section>
          ) : null}

        </Form>
      ) : null}
    </Drawer>
  );
}
