import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Segmented,
  Select,
  Space,
  Switch,
  Typography,
  Upload,
} from "antd";
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
  categoryId: string;
  description?: string;
  occurredAt: dayjs.Dayjs;
  source?: TransactionSource;
  items?: ParsedExpenseItem[];
  recurring?: boolean;
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
  onParseText: (values: { text: string }) => void;
  onParseReceipt: (values: { fileName: string }) => void;
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
  const parsedItems = Form.useWatch("items", form) ?? [];

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
        <Form form={textParserForm} layout="vertical" onFinish={onParseText}>
          <Form.Item name="text" label={t("form.expenseText")} rules={[{ required: true }]}>
            <Input.TextArea rows={4} placeholder={t("placeholder.expenseText")} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block icon={<Sparkles size={16} />}>
            {t("actions.parseMock")}
          </Button>
        </Form>
      ) : mode === "receipt" ? (
        <Card>
          <Space direction="vertical" size={12}>
            <ReceiptText size={28} />
            <Text>{t("receipt.mockReserved")}</Text>
            <Upload
              accept="image/*,.pdf"
              beforeUpload={(file) => {
                setReceiptFileName(file.name);
                return false;
              }}
              maxCount={1}
              showUploadList={false}
            >
              <Button icon={<UploadIcon size={16} />}>{t("receipt.selectFile")}</Button>
            </Upload>
            {receiptFileName ? (
              <Text className="muted">
                {t("receipt.selectedFile", { name: receiptFileName })}
              </Text>
            ) : null}
            <Button
              type="primary"
              disabled={!receiptFileName}
              onClick={() => {
                if (receiptFileName) onParseReceipt({ fileName: receiptFileName });
              }}
              block
              icon={<Sparkles size={16} />}
            >
              {t("actions.parseReceipt")}
            </Button>
            <Button onClick={() => onModeChange("manual")}>{t("actions.backToManual")}</Button>
          </Space>
        </Card>
      ) : (
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            type: "expense",
            currency: baseCurrency,
            occurredAt: dayjs(),
          }}
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
                { value: "adjustment", label: t("transaction.adjustment") },
              ]}
            />
          </Form.Item>
          <Form.Item name="amount" label={t("form.amount")} rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="currency" label={t("form.currency")} rules={[{ required: true }]}>
            <CurrencySelect />
          </Form.Item>
          <Form.Item name="categoryId" label={t("assistant.category")} rules={[{ required: true }]}>
            <Select
              options={categories.map((category) => ({
                value: category.id,
                label: getCategoryName(category, t),
              }))}
            />
          </Form.Item>
          <Form.Item name="occurredAt" label={t("form.date")} rules={[{ required: true }]}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="description" label={t("form.description")}>
            <Input />
          </Form.Item>
          <Form.Item name="source" hidden>
            <Input />
          </Form.Item>
          {parsedItems.length > 0 ? (
            <Card className="parsed-items-card" size="small" title={t("section.parsedItems")}>
              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                {parsedItems.map((item) => (
                  <div className="parsed-item-row" key={`${item.name}-${item.amount}`}>
                    <Text>{item.name}</Text>
                    <Text strong>{formatParsedAmount(item.amount, baseCurrency)}</Text>
                  </div>
                ))}
              </Space>
            </Card>
          ) : null}
          <Form.Item name="recurring" label={t("form.monthlyRecurring")} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            {t("actions.saveTransaction")}
          </Button>
        </Form>
      )}
    </>
  );
}

function formatParsedAmount(amount: number, currency: Currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
