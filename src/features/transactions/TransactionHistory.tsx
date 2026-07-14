import Button from "antd/es/button";
import Space from "antd/es/space";
import Table from "antd/es/table";
import Tag from "antd/es/tag";
import Tooltip from "antd/es/tooltip";
import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getTransactionDescription } from "../../shared/i18n/displayText";
import { useI18n } from "../../shared/i18n/i18nContext";
import { convertMoney } from "../../shared/lib/currency";
import { formatMoney, shortDate } from "../../shared/lib/format";
import type { Currency, Transaction } from "../../shared/types/finance";

interface TransactionHistoryProps {
  transactions: Transaction[];
  displayCurrency: Currency | "native";
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}

export function TransactionHistory({
  transactions,
  displayCurrency,
  onEdit,
  onDelete,
}: TransactionHistoryProps) {
  const { t } = useI18n();
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 560px)").matches);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 560px)");
    const update = () => setIsMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const visibleTransactions = useMemo(() => {
    return [...transactions].sort(
      (a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt),
    );
  }, [transactions]);

  return (
    <div className="history-stack">
      <Table
        className="history-table"
        size="small"
        rowKey="id"
        pagination={{ pageSize: isMobile ? 8 : 12, size: "small", showSizeChanger: false }}
        locale={{ emptyText: t("empty.noTransactions") }}
        dataSource={visibleTransactions}
        columns={[
          {
            title: t("table.date"),
            dataIndex: "occurredAt",
            className: "history-date-cell",
            width: isMobile ? 62 : 72,
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
            width: isMobile ? 96 : 128,
            render: (_, row) => {
              const currency = displayCurrency === "native" ? row.currency : displayCurrency;
              const amount =
                displayCurrency === "native"
                  ? row.amount
                  : convertMoney(row.amount, row.currency, displayCurrency, row.occurredAt);
              const isNegative = row.type === "expense" || row.type === "debt_payment";
              const sign = isNegative ? "-" : "+";
              return (
                <span className={isNegative ? "amount-negative" : "amount-positive"}>
                  {sign}
                  {formatMoney(amount, currency)}
                </span>
              );
            },
          },
          {
            title: "",
            className: "history-actions-cell",
            width: isMobile ? 64 : 76,
            render: (_, row) => (
              <Space className="row-actions" size={4}>
                <Tooltip title={t("actions.edit")}>
                  <Button aria-label={t("actions.edit")} icon={<Pencil size={14} />} size="small" type="text" onClick={() => onEdit(row)} />
                </Tooltip>
                <Tooltip title={t("actions.delete")}>
                  <Button aria-label={t("actions.delete")} danger icon={<Trash2 size={14} />} size="small" type="text" onClick={() => onDelete(row)} />
                </Tooltip>
              </Space>
            ),
          },
        ]}
      />
    </div>
  );
}
