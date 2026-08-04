import Button from "antd/es/button";
import Empty from "antd/es/empty";
import Tag from "antd/es/tag";
import { Pencil, Trash2 } from "lucide-react";
import { useI18n } from "../../shared/i18n/i18nContext";
import { formatMoney } from "../../shared/lib/format";
import type { Currency, Transaction } from "../../shared/types/finance";
import type { ExpenseHistoryEntry } from "./expenseAnalytics";

interface ExpenseHistoryProps {
  entries: ExpenseHistoryEntry[];
  displayCurrency: Currency;
  categoryFiltered: boolean;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}

export function ExpenseHistory({
  entries,
  displayCurrency,
  categoryFiltered,
  onEdit,
  onDelete,
}: ExpenseHistoryProps) {
  const { locale, t } = useI18n();

  if (entries.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("empty.noExpenses")} />;
  }

  return (
    <div className="expense-history-list">
      {entries.map(({ transaction, contribution }) => (
        <article className="expense-history-row" key={transaction.id}>
          <div className="expense-history-main">
            <div className="expense-history-description">
              {transaction.description || t("expense.untitled")}
            </div>
            <div className="expense-history-meta">
              <time dateTime={transaction.occurredAt}>
                {new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                }).format(new Date(transaction.occurredAt)).replace(" г.", "")}
              </time>
              {transaction.source === "receipt_ai" ? (
                <Tag bordered={false}>{t("source.receipt_ai")}</Tag>
              ) : transaction.source === "text_ai" ? (
                <Tag bordered={false}>{t("source.text_ai")}</Tag>
              ) : null}
            </div>
          </div>
          <div className="expense-history-side">
            <div className="expense-history-amount">
              {categoryFiltered
                ? formatMoney(contribution, displayCurrency)
                : formatMoney(transaction.amount, transaction.currency)}
            </div>
            {categoryFiltered ? (
              <div className="expense-history-contribution">{t("expense.filteredContribution")}</div>
            ) : null}
            <div className="expense-history-actions">
              <Button
                aria-label={t("actions.edit")}
                icon={<Pencil size={15} />}
                type="text"
                onClick={() => onEdit(transaction)}
              />
              <Button
                aria-label={t("actions.delete")}
                danger
                icon={<Trash2 size={15} />}
                type="text"
                onClick={() => onDelete(transaction)}
              />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
