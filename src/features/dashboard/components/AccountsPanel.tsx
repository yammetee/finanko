import { Empty, Typography } from "antd";
import { useI18n } from "../../../shared/i18n/i18nContext";
import { getAccountBalance } from "../../finance/selectors";
import { AccountRow } from "./AccountRow";
import type { Account, Transaction } from "../../../shared/types/finance";

const { Text } = Typography;

interface AccountsPanelProps {
  accounts: Account[];
  transactions: Transaction[];
  totalBalance: number;
  className?: string;
  onArchiveAccount?: (account: Account) => void;
}

export function AccountsPanel({
  accounts,
  transactions,
  totalBalance,
  className = "span-4",
  onArchiveAccount,
}: AccountsPanelProps) {
  const { t } = useI18n();

  return (
    <section className={className}>
      <Text className="sidebar-section-title">{t("section.accounts")}</Text>
      <div className="sidebar-account-list">
        {accounts.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("empty.noAccounts")} />
        ) : (
          accounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              balance={getAccountBalance(account, transactions)}
              total={Math.max(totalBalance, 1)}
              onArchive={onArchiveAccount}
            />
          ))
        )}
      </div>
    </section>
  );
}
