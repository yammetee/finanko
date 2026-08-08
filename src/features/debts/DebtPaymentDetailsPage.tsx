import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../shared/i18n/i18nContext";
import { formatMoney } from "../../shared/lib/format";
import type { Debt, DebtPayment, DebtPaymentBreakdown } from "./debtTypes";

interface Props { debt: Debt; payment: DebtPayment; breakdown: DebtPaymentBreakdown; onBack: () => void; onEdit: () => void; onDelete: () => void }

export function DebtPaymentDetailsPage({ debt, payment, breakdown, onBack, onEdit, onDelete }: Props) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  return <section className="details-page">
    <header className="page-heading"><button type="button" onClick={onBack} aria-label={t("actions.back")}><ArrowLeft size={19}/></button><h1>{t("debt.payment")}</h1></header>
    <div className="details-amount capital-details-amount"><span>{debt.name}</span><strong>{formatMoney(Number(payment.amount), debt.currency)}</strong></div>
    <dl className="details-list"><div><dt>{t("form.date")}</dt><dd>{payment.occurredAt.slice(0, 10)}</dd></div><div><dt>{t("debt.interestPart")}</dt><dd>{formatMoney(Number(breakdown.interest), debt.currency)}</dd></div><div><dt>{t("debt.principalPart")}</dt><dd>{formatMoney(Number(breakdown.scheduledPrincipal) + Number(breakdown.earlyPrincipal), debt.currency)}</dd></div><div><dt>{t("debt.afterPayment")}</dt><dd>{formatMoney(Number(breakdown.principalAfter), debt.currency)}</dd></div></dl>
    {confirming ? <div className="delete-confirm"><div><button type="button" onClick={() => setConfirming(false)}>{t("actions.cancel")}</button><button className="danger-button" type="button" onClick={onDelete}>{t("actions.delete")}</button></div></div> : <div className="details-actions"><button type="button" onClick={onEdit}><Pencil size={16}/>{t("actions.edit")}</button><button className="danger-link" type="button" onClick={() => setConfirming(true)}><Trash2 size={16}/>{t("actions.delete")}</button></div>}
  </section>;
}
