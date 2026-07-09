import Button from "antd/es/button";
import Card from "antd/es/card";
import DatePicker from "antd/es/date-picker";
import Form from "antd/es/form";
import Input from "antd/es/input";
import InputNumber from "antd/es/input-number";
import Segmented from "antd/es/segmented";
import Select from "antd/es/select";
import Space from "antd/es/space";
import Switch from "antd/es/switch";
import Typography from "antd/es/typography";
import Upload from "antd/es/upload";
import { ReceiptText, Sparkles, UploadIcon } from "lucide-react";
import dayjs from "dayjs";
import { useState } from "react";
import { getAccountName, getCategoryName } from "../../shared/i18n/displayText";
import { useI18n } from "../../shared/i18n/i18nContext";
import { CurrencySelect } from "../../shared/ui/FormSelects";
import type {
  Account,
  Category,
  Currency,
  TransactionSource,
  TransactionType,
} from "../../shared/types/finance";
import type { ParsedExpenseItem } from "../receipts/expenseParser";

const { Text } = Typography;

export interface TransactionFormValues {
  accountId: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  categoryId?: string;
  linkedAccountId?: string;
  principalAmount?: number;
  interestAmount?: number;
  description?: string;
  occurredAt: dayjs.Dayjs;
  source?: TransactionSource;
  items?: ParsedExpenseItem[];
  recurring?: boolean;
  recurringMonths?: number;
}

interface TransactionFormProps {
  form: ReturnType<typeof Form.useForm<TransactionFormValues>>[0];
  textParserForm: ReturnType<typeof Form.useForm<{ text: string }>>[0];
  mode: string;
  baseCurrency: Currency;
  accounts: Account[];
  categories: Category[];
  onModeChange: (mode: string) => void;
  onFinish: (values: TransactionFormValues) => void;
  onParseText: (values: { text: string }) => void | Promise<void>;
  onParseReceipt: (values: {
    fileName: string;
    fileType?: string;
    fileDataUrl?: string;
  }) => void | Promise<void>;
}

function readFileAsDataUrl(file: File | Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const maxReceiptDataUrlChars = 3_500_000;

async function prepareReceiptFileDataUrl(file: File) {
  if (!file.type.startsWith("image/")) {
    if (file.size > 750_000) return undefined;
    const dataUrl = await readFileAsDataUrl(file);
    return dataUrl.length <= maxReceiptDataUrlChars ? dataUrl : undefined;
  }

  const imageUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Receipt image could not be loaded"));
      image.src = imageUrl;
    });

    const maxSide = 2200;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return readFileAsDataUrl(file);
    context.drawImage(image, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    return dataUrl.length <= maxReceiptDataUrlChars ? dataUrl : undefined;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export function TransactionForm({
  form,
  textParserForm,
  mode,
  baseCurrency,
  accounts,
  categories,
  onModeChange,
  onFinish,
  onParseText,
  onParseReceipt,
}: TransactionFormProps) {
  const { t } = useI18n();
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);
  const [receiptParsing, setReceiptParsing] = useState(false);
  const [textParsing, setTextParsing] = useState(false);
  const parsedItems = Form.useWatch("items", { form, preserve: true }) ?? [];
  const recurring = Form.useWatch("recurring", form);
  const transactionType = Form.useWatch("type", form);
  const isDebtPayment = transactionType === "debt_payment";
  const categoryType = transactionType === "income" ? "income" : "expense";
  const categoryOptions = categories
    .filter((category) => category.type === categoryType)
    .map((category) => ({
      value: category.id,
      label: getCategoryName(category, t),
    }));

  async function parseText(values: { text: string }) {
    setTextParsing(true);
    try {
      await onParseText(values);
    } finally {
      setTextParsing(false);
    }
  }

  async function parseReceipt(file: File) {
    setReceiptFileName(file.name);
    setReceiptParsing(true);
    try {
      await onParseReceipt({
        fileName: file.name,
        fileType: file.type,
        fileDataUrl: await prepareReceiptFileDataUrl(file),
      });
    } finally {
      setReceiptParsing(false);
    }
  }

  return (
    <>
      <Segmented
        block
        value={mode}
        options={[
          { label: t("inputMode.manual"), value: "manual" },
          { label: t("inputMode.text"), value: "text" },
          { label: t("inputMode.receipt"), value: "receipt" },
        ]}
        onChange={(value) => onModeChange(String(value))}
        style={{ marginBottom: 18 }}
      />
      {mode === "text" ? (
        <Form form={textParserForm} layout="vertical" onFinish={parseText}>
          <Form.Item name="text" label={t("form.expenseText")} rules={[{ required: true }]}>
            <Input.TextArea rows={4} placeholder={t("placeholder.expenseText")} />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            block
            icon={<Sparkles size={16} />}
            loading={textParsing}
          >
            {t("actions.parseSmart")}
          </Button>
        </Form>
      ) : null}
      {mode === "receipt" ? (
        <Card>
          <Space direction="vertical" size={12}>
            <ReceiptText size={28} />
            <Text>{t("receipt.description")}</Text>
            <Upload
              accept="image/*,.pdf"
              beforeUpload={(file) => {
                void parseReceipt(file);
                return false;
              }}
              maxCount={1}
              showUploadList={false}
            >
              <Button icon={<UploadIcon size={16} />} loading={receiptParsing}>
                {t("receipt.selectFile")}
              </Button>
            </Upload>
            {receiptFileName ? (
              <Text className="muted">
                {t("receipt.selectedFile", { name: receiptFileName })}
              </Text>
            ) : null}
          </Space>
        </Card>
      ) : null}
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          type: "expense",
          currency: baseCurrency,
          occurredAt: dayjs(),
          recurringMonths: 12,
        }}
        style={{ display: mode === "manual" ? undefined : "none" }}
      >
          <Form.Item name="accountId" label={t("form.account")} rules={[{ required: true }]}>
            <Select
              options={accounts.map((account) => ({
                value: account.id,
                label: getAccountName(account, t),
              }))}
            />
          </Form.Item>
          <Form.Item name="type" label={t("form.type")} rules={[{ required: true }]}>
            <Segmented
              block
              options={[
                { value: "income", label: t("transaction.income") },
                { value: "expense", label: t("transaction.expense") },
                { value: "debt_payment", label: t("transaction.debtPayment") },
              ]}
              onChange={() => {
                form.setFieldsValue({
                  categoryId: undefined,
                  recurring: false,
                  recurringMonths: 12,
                });
              }}
            />
          </Form.Item>
          {isDebtPayment ? (
            <Form.Item
              name="linkedAccountId"
              label={t("form.debtAccount")}
              rules={[{ required: true }]}
            >
              <Select
                options={accounts.map((account) => ({
                  value: account.id,
                  label: getAccountName(account, t),
                }))}
              />
            </Form.Item>
          ) : null}
          <Form.Item name="amount" label={t("form.amount")} rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          {isDebtPayment ? (
            <>
              <Form.Item
                name="principalAmount"
                label={t("form.principalAmount")}
                rules={[{ required: true }]}
              >
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="interestAmount" label={t("form.interestAmount")}>
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </>
          ) : null}
          <Form.Item name="currency" label={t("form.currency")} rules={[{ required: true }]}>
            <CurrencySelect />
          </Form.Item>
          <Form.Item name="categoryId" label={t("assistant.category")} rules={[{ required: true }]}>
            <Select options={categoryOptions} />
          </Form.Item>
          <Form.Item name="occurredAt" label={t("form.date")} rules={[{ required: true }]}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="source" hidden>
            <Input />
          </Form.Item>
          {parsedItems.length > 0 ? (
            <Card className="parsed-items-card" size="small" title={t("section.parsedItems")}>
              <Form.List name="items">
                {(fields) => (
                  <Space direction="vertical" size={8} style={{ width: "100%" }}>
                    <div className="parsed-item-header" aria-hidden="true">
                      <span>{t("form.name")}</span>
                      <span>{t("form.quantity")}</span>
                      <span>{t("form.unitPrice")}</span>
                      <span>{t("form.lineTotal")}</span>
                      <span>{t("assistant.category")}</span>
                    </div>
                    {fields.map((field) => (
                      <div className="parsed-item-row" key={field.key}>
                        <label className="parsed-item-cell">
                          <span className="parsed-item-mobile-label">{t("form.name")}</span>
                          <Form.Item name={[field.name, "name"]} noStyle>
                            <Input aria-label={t("form.name")} />
                          </Form.Item>
                        </label>
                        <label className="parsed-item-cell">
                          <span className="parsed-item-mobile-label">{t("form.quantity")}</span>
                          <Form.Item name={[field.name, "quantity"]} noStyle>
                            <InputNumber
                              aria-label={t("form.quantity")}
                              min={0}
                              className="parsed-item-quantity"
                            />
                          </Form.Item>
                        </label>
                        <label className="parsed-item-cell">
                          <span className="parsed-item-mobile-label">{t("form.unitPrice")}</span>
                          <Form.Item name={[field.name, "unitPrice"]} noStyle>
                            <InputNumber
                              aria-label={t("form.unitPrice")}
                              className="parsed-item-unit-price"
                            />
                          </Form.Item>
                        </label>
                        <label className="parsed-item-cell">
                          <span className="parsed-item-mobile-label">{t("form.lineTotal")}</span>
                          <Form.Item name={[field.name, "amount"]} noStyle>
                            <InputNumber
                              aria-label={t("form.lineTotal")}
                              className="parsed-item-amount"
                            />
                          </Form.Item>
                        </label>
                        <label className="parsed-item-cell">
                          <span className="parsed-item-mobile-label">{t("assistant.category")}</span>
                          <Form.Item name={[field.name, "categoryId"]} noStyle>
                            <Select
                              aria-label={t("assistant.category")}
                              className="parsed-item-category"
                              options={categoryOptions}
                            />
                          </Form.Item>
                        </label>
                        <Form.Item name={[field.name, "confidence"]} noStyle hidden>
                          <InputNumber />
                        </Form.Item>
                      </div>
                    ))}
                  </Space>
                )}
              </Form.List>
            </Card>
          ) : null}
          {parsedItems.length === 0 ? (
            <Form.Item name="description" label={t("form.description")}>
              <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
            </Form.Item>
          ) : null}
          {!isDebtPayment ? (
            <Form.Item name="recurring" label={t("form.monthlyRecurring")} valuePropName="checked">
              <Switch />
            </Form.Item>
          ) : null}
          {recurring ? (
            <Form.Item
              name="recurringMonths"
              label={t("form.recurringMonths")}
              rules={[{ required: true }]}
            >
              <InputNumber min={1} max={120} style={{ width: "100%" }} />
            </Form.Item>
          ) : null}
          <Button type="primary" htmlType="submit" block>
            {t("actions.saveTransaction")}
          </Button>
      </Form>
    </>
  );
}
