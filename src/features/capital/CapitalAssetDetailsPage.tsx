import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../shared/i18n/i18nContext";
import { formatMoney } from "../../shared/lib/format";
import { decimal, decimalString, divide, multiply } from "../../shared/lib/decimal";
import { getCapitalItemLabel } from "./capitalLabels";
import type { buildCapitalPositions } from "./capitalView";

type CapitalPositionView = ReturnType<typeof buildCapitalPositions>[number];

interface Props {
  position: CapitalPositionView;
  groupName?: string;
  quoteUnavailable: boolean;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function CapitalAssetDetailsPage({ position, groupName, quoteUnavailable, onBack, onEdit, onDelete }: Props) {
  const { locale, t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const { item } = position;
  const interestRate = item.type === "deposit" && item.annualInterestRate ? decimal(item.annualInterestRate) : undefined;
  const monthlyInterest = interestRate === undefined ? undefined : divide(multiply(
    decimal(position.currentValue),
    item.defaultTaxRate ? multiply(interestRate, decimal("1") - decimal(item.defaultTaxRate)) : interestRate,
  ), decimal("12"));

  return <section className="details-page">
    <header className="page-heading"><button type="button" onClick={onBack} aria-label={t("actions.back")}><ArrowLeft size={19}/></button><h1>{t("capital.asset.details")}</h1></header>
    <div className="details-amount capital-details-amount"><span>{item.name}</span><strong>{formatMoney(position.value, item.quoteCurrency)}</strong></div>
    <dl className="details-list">
      <div><dt>{t("capital.asset.type")}</dt><dd>{getCapitalItemLabel(item.type, locale)}</dd></div>
      {item.symbol ? <div><dt>{t("capital.asset.symbol")}</dt><dd>{item.symbol}</dd></div> : null}
      {groupName ? <div><dt>{t("capital.asset.group")}</dt><dd>{groupName}</dd></div> : null}
      <div><dt>{t("capital.asset.quantity")}</dt><dd>{position.quantity}</dd></div>
      <div><dt>{t("capital.average")}</dt><dd>{formatMoney(Number(position.averageCost), item.quoteCurrency)}</dd></div>
      {interestRate !== undefined ? <div><dt>{t("capital.asset.interestRate")}</dt><dd>{new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 4 }).format(Number(item.annualInterestRate) * 100)}%</dd></div> : null}
      {monthlyInterest !== undefined ? <div><dt>{t(item.defaultTaxRate ? "capital.asset.monthlyIncomeNet" : "capital.asset.monthlyIncome")}</dt><dd className="positive">{formatMoney(Number(decimalString(monthlyInterest)), item.quoteCurrency)}</dd></div> : null}
      <div><dt>{t("capital.result")}</dt><dd className={position.profit < 0 ? "negative" : "positive"}>{formatMoney(position.profit, item.quoteCurrency)}</dd></div>
      {position.netIncome !== "0" ? <div><dt>{t("capital.income")}</dt><dd>{formatMoney(Number(position.netIncome), item.quoteCurrency)}</dd></div> : null}
      {quoteUnavailable ? <div><dt>{t("capital.asset.price")}</dt><dd className="negative">{t("capital.quoteStale")}</dd></div> : null}
    </dl>
    {confirming
      ? <div className="delete-confirm"><p>{t("capital.delete.item.description", { name: item.name })}</p><div><button type="button" onClick={() => setConfirming(false)}>{t("actions.cancel")}</button><button className="danger-button" type="button" onClick={onDelete}>{t("actions.delete")}</button></div></div>
      : <div className="details-actions"><button type="button" onClick={onEdit}><Pencil size={16}/>{t("actions.edit")}</button><button className="danger-link" type="button" onClick={() => setConfirming(true)}><Trash2 size={16}/>{t("actions.delete")}</button></div>}
  </section>;
}
