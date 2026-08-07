import { ChevronRight } from "lucide-react";
import { useI18n } from "../../shared/i18n/i18nContext";
import { formatMoney } from "../../shared/lib/format";
import type { Currency, Transaction } from "../../shared/types/finance";
import type { ExpenseHistoryEntry } from "./expenseAnalytics";

interface ExpenseRowsProps {
  entries: ExpenseHistoryEntry[];
  displayCurrency: Currency;
  categoryFiltered: boolean;
  onSelect: (transaction: Transaction) => void;
}

export function ExpenseRows({ entries, displayCurrency, categoryFiltered, onSelect }: ExpenseRowsProps) {
  const { locale, t } = useI18n();
  if (entries.length === 0) return <p className="empty-state">{t("empty.noExpenses")}</p>;

  return (
    <div className="expense-rows">
      {entries.map(({ transaction, contribution }) => (
        <button type="button" key={transaction.id} onClick={() => onSelect(transaction)}>
          <span>
            <strong>{transaction.description || t("expense.untitled")}</strong>
            <small>{new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "short" }).format(new Date(transaction.occurredAt)).replace(" г.", "")}</small>
          </span>
          <strong className="row-amount">{categoryFiltered ? formatMoney(contribution, displayCurrency) : formatMoney(transaction.amount, transaction.currency)}</strong>
          <ChevronRight size={16} />
        </button>
      ))}
    </div>
  );
}
