import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { getCategoryName } from "../../shared/i18n/displayText";
import { useI18n, type MessageKey } from "../../shared/i18n/i18nContext";
import { formatMoney } from "../../shared/lib/format";
import type { Category, Transaction, TransactionItem } from "../../shared/types/finance";

const sourceKeys: Record<Transaction["source"], MessageKey> = {
  manual: "source.manual", text_ai: "source.text_ai", receipt_ai: "source.receipt_ai", recurring: "source.recurring", system: "source.system",
};

interface ExpenseDetailsPageProps {
  transaction: Transaction;
  items: TransactionItem[];
  categories: Category[];
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ExpenseDetailsPage({ transaction, items, categories, onBack, onEdit, onDelete }: ExpenseDetailsPageProps) {
  const { locale, t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const category = categoryById.get(transaction.categoryId);
  const occurredAt = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { dateStyle: "long", timeStyle: "short" }).format(new Date(transaction.occurredAt));

  return (
    <section className="details-page">
      <header className="page-heading"><button type="button" onClick={onBack} aria-label={t("actions.back")}><ArrowLeft size={19} /></button><h1>{t("expense.detailTitle")}</h1></header>
      <div className="details-amount"><span>{transaction.description || t("expense.untitled")}</span><strong>{formatMoney(transaction.amount, transaction.currency)}</strong></div>
      <dl className="details-list">
        <div><dt>{t("expense.category")}</dt><dd>{category ? getCategoryName(category, t) : "—"}</dd></div>
        <div><dt>{t("form.date")}</dt><dd>{occurredAt}</dd></div>
        <div><dt>{t("form.currency")}</dt><dd>{transaction.currency}</dd></div>
        <div><dt>{t("expense.source")}</dt><dd>{t(sourceKeys[transaction.source])}</dd></div>
      </dl>
      {items.length > 0 ? <section className="details-items"><h2>{t("section.receiptItems")}</h2>{items.map((item) => <div key={item.id}><span>{item.name}</span><strong>{formatMoney(item.amount, transaction.currency)}</strong></div>)}</section> : null}
      {confirming ? (
        <div className="delete-confirm"><p>{t("expense.deleteDescription", { name: transaction.description || t("expense.untitled") })}</p><div><button type="button" onClick={() => setConfirming(false)}>{t("actions.cancel")}</button><button className="danger-button" type="button" onClick={onDelete}>{t("actions.delete")}</button></div></div>
      ) : <div className="details-actions"><button type="button" onClick={onEdit}><Pencil size={16} />{t("actions.edit")}</button><button className="danger-link" type="button" onClick={() => setConfirming(true)}><Trash2 size={16} />{t("actions.delete")}</button></div>}
    </section>
  );
}
