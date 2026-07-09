import Empty from "antd/es/empty";
import Typography from "antd/es/typography";
import { useI18n } from "../../../shared/i18n/i18nContext";
import { getAccountBalance } from "../../finance/selectors";
import { AccountRow } from "./AccountRow";
import type { Account, Transaction } from "../../../shared/types/finance";

const { Text } = Typography;

interface AccountsPanelProps {
  accounts: Account[];
  transactions: Transaction[];
  totalBalance: number;
  id?: string;
  className?: string;
  onEditAccount?: (account: Account) => void;
  onArchiveAccount?: (account: Account) => void;
}

export function AccountsPanel({
  accounts,
  transactions,
  totalBalance,
  id,
  className = "span-4",
  onEditAccount,
  onArchiveAccount,
}: AccountsPanelProps) {
  const { t } = useI18n();

  return (
    <section className={className} id={id}>
      <Text className="sidebar-section-title">{t("section.accounts")}</Text>
      <div className="sidebar-account-list">
        {accounts.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("empty.noAccounts")} />
        ) : (
          accounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              accounts={accounts}
              balance={getAccountBalance(account, transactions, accounts)}
              total={Math.max(totalBalance, 1)}
              onEdit={onEditAccount}
              onArchive={onArchiveAccount}
            />
          ))
        )}
      </div>
    </section>
  );
}
