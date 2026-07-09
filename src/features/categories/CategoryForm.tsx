import Button from "antd/es/button";
import Form, { type FormInstance } from "antd/es/form";
import Input from "antd/es/input";
import Segmented from "antd/es/segmented";
import type { Category } from "../../shared/types/finance";
import { useI18n } from "../../shared/i18n/i18nContext";

export interface CategoryFormValues {
  name: string;
  type: Category["type"];
  color: string;
}

const CATEGORY_COLORS = [
  "#55b8e8",
  "#5fd38a",
  "#f0bf4d",
  "#a98be8",
  "#f27f89",
  "#51c3cc",
  "#d07adf",
  "#8ca3b5",
];

interface CategoryFormProps {
  form: FormInstance<CategoryFormValues>;
  onFinish: (values: CategoryFormValues) => void;
}

export function CategoryForm({ form, onFinish }: CategoryFormProps) {
  const { t } = useI18n();

  return (
    <Form<CategoryFormValues>
      form={form}
      layout="vertical"
      initialValues={{ type: "expense", color: CATEGORY_COLORS[0] }}
      onFinish={onFinish}
    >
      <Form.Item name="name" label={t("form.name")} rules={[{ required: true }]}>
        <Input autoFocus />
      </Form.Item>

      <Form.Item name="type" label={t("form.type")} rules={[{ required: true }]}>
        <Segmented
          block
          options={[
            { label: t("transaction.expense"), value: "expense" },
            { label: t("transaction.income"), value: "income" },
          ]}
        />
      </Form.Item>

      <Form.Item name="color" label={t("form.color")} rules={[{ required: true }]}>
        <Segmented
          block
          className="category-color-picker"
          options={CATEGORY_COLORS.map((color) => ({
            value: color,
            label: <span className="category-color-swatch" style={{ backgroundColor: color }} />,
          }))}
        />
      </Form.Item>

      <Button block type="primary" htmlType="submit">
        {t("actions.saveCategory")}
      </Button>
    </Form>
  );
}
