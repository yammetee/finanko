import Button from "antd/es/button";
import Progress from "antd/es/progress";
import Space from "antd/es/space";
import Typography from "antd/es/typography";
import { Archive, Pencil } from "lucide-react";
import { useI18n } from "../../../shared/i18n/i18nContext";
import { getAccountName } from "../../../shared/i18n/displayText";
import { formatMoney } from "../../../shared/lib/format";
import { isLiabilityAccount } from "../../../shared/lib/accounts";
import type { Account, Currency } from "../../../shared/types/finance";

const { Text } = Typography;

interface AccountRowProps {
  account: Account;
  accounts: Account[];
  balance: number;
  allocationBalance: number;
  displayCurrency: Currency;
  total: number;
  onEdit?: (account: Account) => void;
  onArchive?: (account: Account) => void;
}

export function AccountRow({
  account,
  accounts,
  balance,
  allocationBalance,
  displayCurrency,
  total,
  onEdit,
  onArchive,
}: AccountRowProps) {
  const { t } = useI18n();
  const percent = total > 0 ? (Math.abs(allocationBalance) / total) * 100 : 0;
  const allocationAccount = accounts.find(
    (candidate) => candidate.id === account.interestAllocationAccountId,
  );
  const isLiability = isLiabilityAccount(account);
  const interestText =
    account.annualInterestRate && account.interestFrequency
      ? isLiability
        ? t("account.liabilityInterestSummary", {
            rate: account.annualInterestRate,
            frequency: t(`interest.${account.interestFrequency}`),
            term: account.loanTermMonths
              ? t("account.loanTermMonths", { months: account.loanTermMonths })
              : t("account.noLoanTerm"),
          })
        : t("account.interestSummary", {
            rate: account.annualInterestRate,
            frequency: t(`interest.${account.interestFrequency}`),
            target: allocationAccount ? getAccountName(allocationAccount, t) : t("account.sameAccount"),
          })
      : "";

  return (
    <div className="account-row">
      <div className="account-row-main">
        <Space className="account-row-name">
          <span
            style={{
              background: account.color,
              borderRadius: 999,
              display: "inline-block",
              height: 8,
              width: 8,
            }}
          />
          <span className="account-row-title-stack">
            <Text>{getAccountName(account, t)}</Text>
            {interestText ? <Text className="account-interest-text">{interestText}</Text> : null}
          </span>
        </Space>
        <Text className="account-row-balance" strong>
          {formatMoney(balance, displayCurrency)}
        </Text>
        {onEdit ? (
          <Button
            aria-label={t("actions.edit")}
            className="account-row-action"
            icon={<Pencil size={13} />}
            size="small"
            type="text"
            onClick={() => onEdit(account)}
          />
        ) : null}
        {onArchive ? (
          <Button
            aria-label={t("actions.archive")}
            className="account-row-action"
            icon={<Archive size={13} />}
            size="small"
            type="text"
            onClick={() => onArchive(account)}
          />
        ) : null}
      </div>
      <Progress
        percent={Math.max(4, Math.min(100, percent))}
        showInfo={false}
        strokeColor={balance < 0 ? "#fca5a5" : account.color}
        trailColor="#20252d"
        size="small"
      />
    </div>
  );
}
