import { Button, Form, Input, InputNumber } from "antd";
import { useI18n } from "../../shared/i18n/i18nContext";
import { AccountTypeSelect, CurrencySelect } from "../../shared/ui/FormSelects";
import type { AccountType, Currency } from "../../shared/types/finance";

export interface AccountFormValues {
  name: string;
  type: AccountType;
  currency: Currency;
  initialBalance: number;
}

interface AccountFormProps {
  form: ReturnType<typeof Form.useForm<AccountFormValues>>[0];
  onFinish: (values: AccountFormValues) => void;
}

export function AccountForm({ form, onFinish }: AccountFormProps) {
  const { t } = useI18n();

  return (
    <Form form={form} layout="vertical" onFinish={onFinish}>
      <Form.Item name="name" label={t("form.name")} rules={[{ required: true }]}>
        <Input placeholder={t("placeholder.savingsName")} />
      </Form.Item>
      <Form.Item name="type" label={t("form.type")} initialValue="custom" rules={[{ required: true }]}>
        <AccountTypeSelect />
      </Form.Item>
      <Form.Item name="currency" label={t("form.currency")} initialValue="USD" rules={[{ required: true }]}>
        <CurrencySelect />
      </Form.Item>
      <Form.Item
        name="initialBalance"
        label={t("form.initialBalance")}
        initialValue={0}
        rules={[{ required: true }]}
      >
        <InputNumber style={{ width: "100%" }} />
      </Form.Item>
      <Button type="primary" htmlType="submit" block>
        {t("actions.saveAccount")}
      </Button>
    </Form>
  );
}
