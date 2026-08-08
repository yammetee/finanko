import { ArrowLeft, ChevronRight, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../shared/i18n/i18nContext";
import { formatMoney } from "../../shared/lib/format";
import type { Debt, DebtEvent, DebtGroup, DebtProjection } from "./debtTypes";

interface Props { debt: Debt; group?: DebtGroup; projection: DebtProjection; events: DebtEvent[]; onBack: () => void; onEdit: () => void; onDelete: () => void; onEditGroup: () => void; onReconcile: () => void; onSelectEvent: (id: string) => void }

export function DebtDetailsPage({ debt, group, projection, events, onBack, onEdit, onDelete, onEditGroup, onReconcile, onSelectEvent }: Props) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  return <section className="details-page">
    <header className="page-heading"><button type="button" onClick={onBack} aria-label={t("actions.back")}><ArrowLeft size={19}/></button><h1>{t("debt.loan.details")}</h1></header>
    <div className="details-amount capital-details-amount"><span>{debt.name}</span><strong>{formatMoney(Number(projection.principal), debt.currency)}</strong></div>
    <dl className="details-list">
      {debt.lender ? <div><dt>{t("debt.lender")}</dt><dd>{debt.lender}</dd></div> : null}
      <div><dt>{t("debt.type")}</dt><dd>{t(debt.loanType === "mortgage" ? "debt.mortgage" : "debt.consumer")}</dd></div>
      {group ? <div><dt>{t("debt.group")}</dt><dd>{group.name}</dd></div> : null}
      <div><dt>{t("debt.rate")}</dt><dd>{Number(debt.annualRate) * 100}%</dd></div>
      <div><dt>{t("debt.requiredPayment")}</dt><dd>{formatMoney(Number(projection.requiredPayment), debt.currency)}</dd></div>
      {projection.nextPaymentDate ? <div><dt>{t("debt.nextPayment")}</dt><dd>{projection.nextPaymentDate}</dd></div> : null}
      <div><dt>{t("debt.remainingPayments")}</dt><dd>{projection.remainingPayments}</dd></div>
      <div><dt>{t("debt.accruedInterest")}</dt><dd>{formatMoney(Number(projection.accruedInterest), debt.currency)}</dd></div>
    </dl>
    {group ? <button className="add-item-button" type="button" onClick={onEditGroup}><Pencil size={15}/>{t("debt.group.rename")}</button> : null}
    {projection.status === "active" ? <button className="add-item-button" type="button" onClick={onReconcile}><RefreshCw size={15}/>{t("debt.reconcile")}</button> : null}
    {confirming ? <div className="delete-confirm"><div><button type="button" onClick={() => setConfirming(false)}>{t("actions.cancel")}</button><button className="danger-button" type="button" onClick={onDelete}>{t("actions.delete")}</button></div></div> : <div className="details-actions"><button type="button" onClick={onEdit}><Pencil size={16}/>{t("actions.edit")}</button><button className="danger-link" type="button" onClick={() => setConfirming(true)}><Trash2 size={16}/>{t("actions.delete")}</button></div>}
    {events.length ? <section className="history-section"><div className="section-heading"><h2>{t("debt.payment")}</h2><span>{events.length}</span></div><div className="expense-rows">{events.slice().sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.sequence - left.sequence).map((event) => <button type="button" key={event.id} onClick={() => onSelectEvent(event.id)}><span><strong>{event.type === "payment" ? formatMoney(Number(event.amount), debt.currency) : formatMoney(Number(event.principalBalance), debt.currency)}</strong><small>{event.occurredAt.slice(0, 10)}</small></span><strong>{event.type === "reconciliation" ? t("debt.reconcile") : t(event.strategy === "reduce_term" ? "debt.strategy.reduceTerm" : event.strategy === "reduce_payment" ? "debt.strategy.reducePayment" : event.strategy === "full" ? "debt.strategy.full" : "debt.strategy.scheduled")}</strong><ChevronRight size={16}/></button>)}</div></section> : null}
  </section>;
}
