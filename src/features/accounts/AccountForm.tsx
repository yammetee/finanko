import dayjs from "dayjs";
import Button from "antd/es/button";
import DatePicker from "antd/es/date-picker";
import Form from "antd/es/form";
import Input from "antd/es/input";
import InputNumber from "antd/es/input-number";
import Select from "antd/es/select";
import { useI18n } from "../../shared/i18n/i18nContext";
import { getAccountName } from "../../shared/i18n/displayText";
import { AccountTypeSelect, CurrencySelect } from "../../shared/ui/FormSelects";
import type { Account, AccountType, Currency, InterestFrequency } from "../../shared/types/finance";
import { isLiabilityAccountType } from "../../shared/lib/accounts";

const SAME_ACCOUNT_VALUE = "__same_account__";

export interface AccountFormValues {
  name: string;
  type: AccountType;
  currency: Currency;
  initialBalance: number;
  annualInterestRate?: number;
  interestFrequency?: InterestFrequency;
  interestStartedAt?: string;
  interestAllocationAccountId?: string;
  loanTermMonths?: number;
}

interface AccountFormProps {
  form: ReturnType<typeof Form.useForm<AccountFormValues>>[0];
  accounts?: Account[];
  editingAccountId?: string;
  onFinish: (values: AccountFormValues) => void;
}

export function AccountForm({
  form,
  accounts = [],
  editingAccountId,
  onFinish,
}: AccountFormProps) {
  const { t } = useI18n();
  function submit(values: AccountFormValues) {
    onFinish({
      ...values,
      interestAllocationAccountId:
        values.interestAllocationAccountId === SAME_ACCOUNT_VALUE
          ? undefined
          : values.interestAllocationAccountId,
    });
  }

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        type: "custom",
        currency: "USD",
        initialBalance: 0,
        interestAllocationAccountId: SAME_ACCOUNT_VALUE,
      }}
      onFinish={submit}
    >
      <Form.Item name="name" label={t("form.name")} rules={[{ required: true }]}>
        <Input placeholder={t("placeholder.savingsName")} />
      </Form.Item>
      <Form.Item name="type" label={t("form.type")} rules={[{ required: true }]}>
        <AccountTypeSelect
          onChange={(type) => {
            if (!isLiabilityAccountType(type)) return;
            form.setFieldsValue({
              interestFrequency: form.getFieldValue("interestFrequency") ?? "daily",
              interestStartedAt:
                form.getFieldValue("interestStartedAt") ??
                dayjs().startOf("day").toISOString(),
            });
          }}
        />
      </Form.Item>
      <Form.Item name="currency" label={t("form.currency")} rules={[{ required: true }]}>
        <CurrencySelect />
      </Form.Item>
      <Form.Item noStyle shouldUpdate={(previous, current) => previous.type !== current.type}>
        {({ getFieldValue }) => {
          const accountType = (getFieldValue("type") ?? "custom") as AccountType;
          const isLiability = isLiabilityAccountType(accountType);

          return (
            <>
              <Form.Item
                name="initialBalance"
                label={t(isLiability ? "form.outstandingBalance" : "form.initialBalance")}
                rules={[{ required: true }]}
              >
                <InputNumber style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="annualInterestRate" label={t("form.annualInterestRate")}>
                <InputNumber min={0} max={1000} addonAfter="%" style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="interestFrequency" label={t("form.interestFrequency")}>
                <Select
                  allowClear
                  options={[
                    { value: "daily", label: t("interest.daily") },
                    { value: "monthly", label: t("interest.monthly") },
                  ]}
                />
              </Form.Item>
              <Form.Item
                name="interestStartedAt"
                label={t("form.interestStartedAt")}
                getValueProps={(value?: string) => ({ value: value ? dayjs(value) : undefined })}
                normalize={(value?: dayjs.Dayjs) => value?.startOf("day").toISOString()}
              >
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
              {!isLiability ? (
                <Form.Item name="interestAllocationAccountId" label={t("form.interestAllocationAccount")}>
                  <Select
                    allowClear
                    options={[
                      {
                        value: SAME_ACCOUNT_VALUE,
                        label: t("account.sameAccount"),
                      },
                      ...accounts
                        .filter((account) => account.id !== editingAccountId)
                        .map((account) => ({
                          value: account.id,
                          label: getAccountName(account, t),
                        })),
                    ]}
                  />
                </Form.Item>
              ) : null}
              {isLiability ? (
                <Form.Item name="loanTermMonths" label={t("form.loanTermMonths")}>
                  <InputNumber min={1} max={600} style={{ width: "100%" }} />
                </Form.Item>
              ) : null}
            </>
          );
        }}
      </Form.Item>
      <Button type="primary" htmlType="submit" block>
        {t("actions.saveAccount")}
      </Button>
    </Form>
  );
}
