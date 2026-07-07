import { Button, Form, Input } from "antd";
import { useI18n } from "../../shared/i18n/i18nContext";
import { CurrencySelect } from "../../shared/ui/FormSelects";
import type { Currency } from "../../shared/types/finance";

export interface PortfolioFormValues {
  name: string;
  baseCurrency: Currency;
}

interface PortfolioFormProps {
  form: ReturnType<typeof Form.useForm<PortfolioFormValues>>[0];
  onFinish: (values: PortfolioFormValues) => void;
}

export function PortfolioForm({ form, onFinish }: PortfolioFormProps) {
  const { t } = useI18n();

  return (
    <Form form={form} layout="vertical" onFinish={onFinish}>
      <Form.Item name="name" label={t("form.name")} rules={[{ required: true }]}>
        <Input placeholder={t("placeholder.portfolioName")} />
      </Form.Item>
      <Form.Item name="baseCurrency" label={t("form.baseCurrency")} initialValue="USD">
        <CurrencySelect />
      </Form.Item>
      <Button type="primary" htmlType="submit" block>
        {t("actions.createPortfolio")}
      </Button>
    </Form>
  );
}
