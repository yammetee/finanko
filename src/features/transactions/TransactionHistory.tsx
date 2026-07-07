import { Button, Space, Table, Tag } from "antd";
import { getTransactionDescription } from "../../shared/i18n/displayText";
import { useI18n } from "../../shared/i18n/i18nContext";
import { formatMoney, shortDate } from "../../shared/lib/format";
import type { Transaction } from "../../shared/types/finance";

interface TransactionHistoryProps {
  transactions: Transaction[];
  onDelete: (transaction: Transaction) => void;
}

export function TransactionHistory({ transactions, onDelete }: TransactionHistoryProps) {
  const { t } = useI18n();

  return (
    <Table
      className="history-table"
      size="small"
      rowKey="id"
      pagination={{ pageSize: 6, size: "small", showSizeChanger: false }}
      locale={{ emptyText: t("empty.noTransactions") }}
      dataSource={[...transactions].sort(
        (a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt),
      )}
      columns={[
        {
          title: t("table.date"),
          dataIndex: "occurredAt",
          render: (value: string) => shortDate(value),
        },
        {
          title: t("table.description"),
          dataIndex: "description",
          render: (value: string, row) => (
            <Space>
              <span>
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
          render: (_, row) => (
            <span className={row.type === "expense" ? "amount-negative" : "amount-positive"}>
              {row.type === "expense" ? "-" : "+"}
              {formatMoney(row.amount, row.currency)}
            </span>
          ),
        },
        {
          title: "",
          render: (_, row) => (
            <Button danger type="text" onClick={() => onDelete(row)}>
              {t("actions.delete")}
            </Button>
          ),
        },
      ]}
    />
  );
}
