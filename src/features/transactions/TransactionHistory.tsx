import Button from "antd/es/button";
import Input from "antd/es/input";
import Space from "antd/es/space";
import Table from "antd/es/table";
import Tag from "antd/es/tag";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { getTransactionDescription } from "../../shared/i18n/displayText";
import { useI18n } from "../../shared/i18n/i18nContext";
import { formatMoney, shortDate } from "../../shared/lib/format";
import type { Transaction } from "../../shared/types/finance";

interface TransactionHistoryProps {
  transactions: Transaction[];
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}

export function TransactionHistory({
  transactions,
  onEdit,
  onDelete,
}: TransactionHistoryProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const visibleTransactions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const sorted = [...transactions].sort(
      (a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt),
    );

    if (!normalizedQuery) return sorted;

    return sorted.filter((transaction) => {
      const description = getTransactionDescription(transaction, t).toLowerCase();
      const amount = String(transaction.amount);
      const date = shortDate(transaction.occurredAt).toLowerCase();
      return (
        description.includes(normalizedQuery) ||
        amount.includes(normalizedQuery) ||
        date.includes(normalizedQuery) ||
        transaction.currency.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [query, transactions, t]);

  return (
    <div className="history-stack">
      <div className="history-controls">
        <Input
          allowClear
          className="history-search"
          prefix={<Search size={14} />}
          placeholder={t("placeholder.searchHistory")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <Table
        className="history-table"
        size="small"
        rowKey="id"
        scroll={{ x: 680 }}
        tableLayout="fixed"
        pagination={{ pageSize: 6, size: "small", showSizeChanger: false }}
        locale={{ emptyText: t("empty.noTransactions") }}
        dataSource={visibleTransactions}
        columns={[
          {
            title: t("table.date"),
            dataIndex: "occurredAt",
            className: "history-date-cell",
            width: 74,
            render: (value: string) => shortDate(value),
          },
          {
            title: t("table.description"),
            dataIndex: "description",
            className: "history-description-cell",
            ellipsis: true,
            render: (value: string, row) => (
              <Space className="history-description-content" size={6}>
                <span className="history-description-text">
                  {value
                    ? getTransactionDescription(row, t)
                    : t("confirm.deleteTransaction.fallback")}
                </span>
                {row.source !== "manual" ? <Tag>{t(`source.${row.source}`)}</Tag> : null}
              </Space>
            ),
          },
          {
            title: t("table.amount"),
            className: "history-amount-cell",
            width: 116,
            render: (_, row) => (
              <span className={row.type === "expense" ? "amount-negative" : "amount-positive"}>
                {row.type === "expense" ? "-" : "+"}
                {formatMoney(row.amount, row.currency)}
              </span>
            ),
          },
          {
            title: "",
            className: "history-actions-cell",
            width: 150,
            render: (_, row) => (
              <Space className="row-actions" size={4}>
                <Button size="small" type="text" onClick={() => onEdit(row)}>
                  {t("actions.edit")}
                </Button>
                <Button danger size="small" type="text" onClick={() => onDelete(row)}>
                  {t("actions.delete")}
                </Button>
              </Space>
            ),
          },
        ]}
      />
    </div>
  );
}
