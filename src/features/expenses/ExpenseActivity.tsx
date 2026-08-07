import { ChevronRight } from "lucide-react";
import { useI18n } from "../../shared/i18n/i18nContext";
import { formatMoney } from "../../shared/lib/format";
import type { Currency, Transaction } from "../../shared/types/finance";
import type { ExpenseHistoryEntry } from "./expenseAnalytics";

interface ExpenseActivityProps {
  entries: ExpenseHistoryEntry[];
  displayCurrency: Currency;
  categoryFiltered: boolean;
  onSelect: (transaction: Transaction) => void;
}

export function ExpenseActivity({ entries, displayCurrency, categoryFiltered, onSelect }: ExpenseActivityProps) {
  const { locale, t } = useI18n();

  if (entries.length === 0) return <p className="activity-empty">{t("empty.noExpenses")}</p>;

  return (
    <div className="activity-list">
      {entries.map(({ transaction, contribution }) => (
        <button type="button" key={transaction.id} onClick={() => onSelect(transaction)}>
          <span className="activity-copy">
            <strong>{transaction.description || t("expense.untitled")}</strong>
            <small>
              {new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
                day: "numeric",
                month: "short",
              }).format(new Date(transaction.occurredAt)).replace(" г.", "")}
            </small>
          </span>
          <strong className="activity-amount">
            {categoryFiltered
              ? formatMoney(contribution, displayCurrency)
              : formatMoney(transaction.amount, transaction.currency)}
          </strong>
          <ChevronRight size={15} />
        </button>
      ))}
    </div>
  );
}
