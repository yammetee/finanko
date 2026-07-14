import Empty from "antd/es/empty";
import Typography from "antd/es/typography";
import { useI18n } from "../../../shared/i18n/i18nContext";
import {
  getAccountBalance,
  getAccountBalanceInCurrency,
} from "../../finance/selectors";
import { AccountRow } from "./AccountRow";
import type { Account, Currency, Transaction } from "../../../shared/types/finance";
import { ContextInsightButton } from "../../assistant/ContextInsightButton";
import type { AssistantSummary } from "../../assistant/assistantSummary";

const { Text } = Typography;

interface AccountsPanelProps {
  accounts: Account[];
  transactions: Transaction[];
  displayCurrency: Currency | "native";
  id?: string;
  className?: string;
  onEditAccount?: (account: Account) => void;
  onArchiveAccount?: (account: Account) => void;
  assistantSummary?: AssistantSummary;
}

export function AccountsPanel({
  accounts,
  transactions,
  displayCurrency,
  id,
  className = "span-4",
  onEditAccount,
  onArchiveAccount,
  assistantSummary,
}: AccountsPanelProps) {
  const { t } = useI18n();

  return (
    <section className={className} id={id}>
      <div className="sidebar-section-heading"><Text className="sidebar-section-title">{t("section.accounts")}</Text>{assistantSummary ? <ContextInsightButton context="accounts" summary={assistantSummary} /> : null}</div>
      <div className="sidebar-account-list">
        {accounts.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("empty.noAccounts")} />
        ) : (
          accounts.map((account) => {
            const rowCurrency = displayCurrency === "native" ? account.currency : displayCurrency;
            return (
              <AccountRow
                key={account.id}
                account={account}
                accounts={accounts}
                balance={
                  displayCurrency === "native"
                    ? getAccountBalance(account, transactions, accounts)
                    : getAccountBalanceInCurrency(
                        account,
                        transactions,
                        displayCurrency,
                        undefined,
                        accounts,
                      )
                }
                displayCurrency={rowCurrency}
                onEdit={onEditAccount}
                onArchive={onArchiveAccount}
              />
            );
          })
        )}
      </div>
    </section>
  );
}
