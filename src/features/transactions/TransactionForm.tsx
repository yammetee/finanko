import Button from "antd/es/button";
import Alert from "antd/es/alert";
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
import { ReceiptText, Sparkles, Trash2, UploadIcon } from "lucide-react";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { getAccountName, getCategoryName } from "../../shared/i18n/displayText";
import { useI18n } from "../../shared/i18n/i18nContext";
import { CurrencySelect } from "../../shared/ui/FormSelects";
import { isLiabilityAccount } from "../../shared/lib/accounts";
import type {
  Account,
  Category,
  Currency,
  TransactionSource,
  TransactionType,
} from "../../shared/types/finance";
import type { ParsedExpenseItem } from "../receipts/expenseParser";
import { prepareReceiptImage } from "../receipts/receiptImage";

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
  onParseText: (values: { text: string; accountId: string }) => void | Promise<void>;
  onParseReceipt: (values: {
    accountId: string;
    fileName: string;
    fileType?: string;
    fileDataUrl?: string;
  }) => boolean | Promise<boolean>;
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
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [textParsing, setTextParsing] = useState(false);
  const [parserAccountId, setParserAccountId] = useState(accounts[0]?.id ?? "");
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
  const accountOptions = accounts.map((account) => ({
    value: account.id,
    label: getAccountName(account, t),
  }));
  const debtAccountOptions = accounts
    .filter((account) => isLiabilityAccount(account))
    .map((account) => ({
      value: account.id,
      label: getAccountName(account, t),
    }));

  useEffect(() => {
    if (!accounts.some((account) => account.id === parserAccountId)) {
      setParserAccountId(accounts[0]?.id ?? "");
    }
  }, [accounts, parserAccountId]);

  async function parseText(values: { text: string }) {
    if (!parserAccountId) return;
    setTextParsing(true);
    try {
      await onParseText({ ...values, accountId: parserAccountId });
    } finally {
      setTextParsing(false);
    }
  }

  async function parseReceipt(file: File) {
    if (!parserAccountId) return;
    setReceiptFileName(file.name);
    setReceiptError(null);
    setReceiptParsing(true);
    try {
      const parsed = await onParseReceipt({
        accountId: parserAccountId,
        fileName: file.name,
        fileType: "image/jpeg",
        fileDataUrl: await prepareReceiptImage(file),
      });
      if (!parsed) setReceiptError(t("receipt.parseError"));
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const key = code === "file_too_large" || code === "compressed_file_too_large"
        ? "receipt.fileTooLarge"
        : code === "unsupported_file" || code === "unsupported_image"
          ? "receipt.unsupported"
          : "receipt.parseError";
      setReceiptError(t(key));
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
      {mode !== "manual" ? (
        <Form.Item label={t("form.account")} required>
          <Select
            value={parserAccountId || undefined}
            options={accountOptions}
            disabled={accounts.length === 0}
            onChange={setParserAccountId}
          />
        </Form.Item>
      ) : null}
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
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
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
            {receiptError ? <Alert message={receiptError} type="error" showIcon /> : null}
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
              options={accountOptions}
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
                options={debtAccountOptions}
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
                {(fields, { remove }) => (
                  <Space direction="vertical" size={8} style={{ width: "100%" }}>
                    <div className="parsed-item-header" aria-hidden="true">
                      <span>{t("form.name")}</span>
                      <span>{t("form.quantity")}</span>
                      <span>{t("form.unitPrice")}</span>
                      <span />
                    </div>
                    {fields.map((field) => (
                      <div className="parsed-item-row" key={field.key}>
                        <label className="parsed-item-cell">
                          <span className="parsed-item-mobile-label">{t("form.name")}</span>
                          <Form.Item name={[field.name, "name"]} noStyle>
                            <Input aria-label={t("form.name")} size="small" />
                          </Form.Item>
                        </label>
                        <label className="parsed-item-cell">
                          <span className="parsed-item-mobile-label">{t("form.quantity")}</span>
                          <Form.Item name={[field.name, "quantity"]} noStyle>
                            <InputNumber
                              aria-label={t("form.quantity")}
                              min={0}
                              className="parsed-item-quantity"
                              size="small"
                            />
                          </Form.Item>
                        </label>
                        <label className="parsed-item-cell">
                          <span className="parsed-item-mobile-label">{t("form.unitPrice")}</span>
                          <Form.Item name={[field.name, "unitPrice"]} noStyle>
                            <InputNumber
                              aria-label={t("form.unitPrice")}
                              className="parsed-item-unit-price"
                              size="small"
                            />
                          </Form.Item>
                        </label>
                        <Form.Item name={[field.name, "amount"]} hidden>
                          <InputNumber />
                        </Form.Item>
                        <Form.Item name={[field.name, "categoryId"]} hidden>
                          <Input />
                        </Form.Item>
                        <Form.Item name={[field.name, "confidence"]} hidden>
                          <InputNumber />
                        </Form.Item>
                        <Button
                          aria-label={t("actions.delete")}
                          className="parsed-item-delete"
                          danger
                          icon={<Trash2 size={14} />}
                          size="small"
                          type="text"
                          onClick={() => remove(field.name)}
                        />
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
