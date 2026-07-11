import Button from "antd/es/button";
import Form from "antd/es/form";
import Input from "antd/es/input";
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
  editing?: boolean;
}

export function PortfolioForm({ form, onFinish, editing = false }: PortfolioFormProps) {
  const { t } = useI18n();

  return (
    <Form form={form} layout="vertical" onFinish={onFinish}>
      <Form.Item name="name" label={t("form.name")} rules={[{ required: true }]}>
        <Input placeholder={t("placeholder.portfolioName")} />
      </Form.Item>
      <Form.Item name="baseCurrency" label={t("form.baseCurrency")} initialValue="USD" hidden={editing}>
        <CurrencySelect />
      </Form.Item>
      <Button type="primary" htmlType="submit" block>
        {t(editing ? "actions.renamePortfolio" : "actions.createPortfolio")}
      </Button>
    </Form>
  );
}
