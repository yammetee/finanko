import { Button, Progress, Space, Typography } from "antd";
import { Archive } from "lucide-react";
import { useI18n } from "../../../shared/i18n/i18nContext";
import { getAccountName } from "../../../shared/i18n/displayText";
import { formatMoney } from "../../../shared/lib/format";
import type { Account } from "../../../shared/types/finance";

const { Text } = Typography;

interface AccountRowProps {
  account: Account;
  balance: number;
  total: number;
  onArchive?: (account: Account) => void;
}

export function AccountRow({ account, balance, total, onArchive }: AccountRowProps) {
  const { t } = useI18n();
  const percent = total > 0 ? (Math.abs(balance) / total) * 100 : 0;

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
          <Text>{getAccountName(account, t)}</Text>
        </Space>
        <Text className="account-row-balance" strong>
          {formatMoney(balance, account.currency)}
        </Text>
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
