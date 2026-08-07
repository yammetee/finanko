import { ChevronRight } from "lucide-react";
import { useI18n } from "../../shared/i18n/i18nContext";
import { formatMoney } from "../../shared/lib/format";
import type { Currency, Expense } from "../../shared/types/expense";
import type { ExpenseHistoryEntry } from "./expenseAnalytics";

interface ExpenseRowsProps {
  entries: ExpenseHistoryEntry[];
  displayCurrency: Currency | "native";
  onSelect: (expense: Expense) => void;
}

export function ExpenseRows({ entries, displayCurrency, onSelect }: ExpenseRowsProps) {
  const { locale, t } = useI18n();
  if (entries.length === 0) return <p className="empty-state">{t("empty.noExpenses")}</p>;

  return (
    <div className="expense-rows">
      {entries.map(({ expense, contribution, nativeContribution }) => (
        <button type="button" key={expense.id} onClick={() => onSelect(expense)}>
          <span>
            <strong>{expense.description || t("expense.untitled")}</strong>
            <small>{new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "short" }).format(new Date(expense.occurredAt)).replace(" г.", "")}</small>
          </span>
          <strong className="row-amount">{displayCurrency === "native"
            ? formatMoney(nativeContribution ?? expense.amount, expense.currency)
            : formatMoney(contribution, displayCurrency)}</strong>
          <ChevronRight size={16} />
        </button>
      ))}
    </div>
  );
}
