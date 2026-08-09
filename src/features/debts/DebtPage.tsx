import { ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { CurrencySwitcher, type DisplayCurrency } from "../../shared/ui/CurrencySwitcher";
import { useFeedback } from "../../shared/ui/feedbackContext";
import { useI18n } from "../../shared/i18n/i18nContext";
import { convertMoney, getHistoricalConversionRates } from "../../shared/lib/currency";
import { formatMoney } from "../../shared/lib/format";
import type { Currency } from "../../shared/types/expense";
import { TrendChart } from "../../shared/ui/TrendChart";
import { buildDebtProjection } from "./debtMath";
import { DebtDetailsPage } from "./DebtDetailsPage";
import { DebtForm } from "./DebtForm";
import { DebtGroupForm } from "./DebtGroupForm";
import { DebtPaymentForm } from "./DebtPaymentForm";
import { DebtPaymentDetailsPage } from "./DebtPaymentDetailsPage";
import { DebtReconciliationForm } from "./DebtReconciliationForm";
import { DebtReconciliationDetailsPage } from "./DebtReconciliationDetailsPage";
import { useDebtStore } from "./debtStore";
import type { Debt, DebtGroup, DebtPayment, DebtReconciliation } from "./debtTypes";
import { buildDebtPositions } from "./debtView";

type Editor = { kind: "group"; value?: DebtGroup } | { kind: "debt"; value?: Debt } | { kind: "payment"; value?: DebtPayment } | { kind: "reconciliation"; value?: DebtReconciliation; debtId?: string } | null;
const COLORS = ["#5a9feb", "#9b82e6", "#58b6ad", "#e8b94c", "#f07f86", "#c69b58"];

export function DebtPage({ currencyMode, onCurrencyChange, ratesVersion }: { currencyMode: DisplayCurrency; onCurrencyChange: (value: DisplayCurrency) => void; ratesVersion: number }) {
  const { message } = useFeedback();
  const { locale, t } = useI18n();
  const state = useDebtStore();
  const [editor, setEditor] = useState<Editor>(null);
  const [saving, setSaving] = useState(false);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "closed">("active");
  const [typeFilter, setTypeFilter] = useState<"all" | Debt["loanType"]>("all");
  const displayCurrency: Currency = currencyMode === "native" ? "USD" : currencyMode;
  const projections = useMemo(() => {
    void ratesVersion;
    return buildDebtPositions(state.debts, state.events);
  }, [ratesVersion, state.debts, state.events]);
  const active = projections.filter(({ projection }) => projection.status === "active");
  const current = projections.filter(({ projection }) => projection.status === statusFilter);
  const visible = current.filter(({ debt }) => (groupFilter === "all" || debt.groupId === groupFilter) && (typeFilter === "all" || debt.loanType === typeFilter));
  const convert = (value: string, currency: Currency, date?: string) => {
    if (!date) return convertMoney(Number(value), currency, displayCurrency);
    const rates = getHistoricalConversionRates(currency, displayCurrency, date);
    return Number(value) / Number(rates.from) * Number(rates.to);
  };
  const total = active.reduce((sum, { debt, projection }) => sum + convert(projection.principal, debt.currency), 0);
  const monthly = active.reduce((sum, { debt, projection }) => sum + convert(projection.requiredPayment, debt.currency), 0);
  const accrued = active.reduce((sum, { debt, projection }) => sum + convert(projection.accruedInterest, debt.currency), 0);
  const remainingInterest = active.reduce((sum, { debt, projection }) => sum + convert(projection.futureInterest, debt.currency), 0);
  const breakdown = state.groups.map((group, index) => ({ id: group.id, name: group.name, color: COLORS[index % COLORS.length], value: current.filter(({ debt }) => debt.groupId === group.id && (typeFilter === "all" || debt.loanType === typeFilter)).reduce((sum, { debt, projection }) => sum + convert(projection.principal, debt.currency), 0) })).filter((value) => value.value > 0).sort((left, right) => right.value - left.value);
  const breakdownTotal = breakdown.reduce((sum, value) => sum + value.value, 0);
  const trendDates = [...new Set([...state.debts.map((debt) => debt.balanceDate), ...state.events.map((event) => event.occurredAt.slice(0, 10))])].sort();
  const trend = trendDates.map((date) => ({ key: date, start: `${date}T00:00:00Z`, end: `${date}T23:59:59Z`, value: state.debts.reduce((sum, debt) => {
    if (debt.balanceDate > date) return sum;
    const projection = buildDebtProjection(debt, state.events.filter((event) => event.occurredAt.slice(0, 10) <= date), date);
    return sum + convert(projection.principal, debt.currency, date);
  }, 0), expenseCount: 1, unit: "day" as const }));
  const selected = projections.find(({ debt }) => debt.id === selectedDebtId);
  const selectedEvent = state.events.find((event) => event.id === selectedEventId);

  const save = async (action: () => Promise<unknown>) => {
    setSaving(true);
    try { await action(); setEditor(null); message.success(t("debt.saved")); }
    catch { message.error(t("feedback.saveFailed")); }
    finally { setSaving(false); }
  };
  if (editor?.kind === "group") return <DebtGroupForm group={editor.value} saving={saving} onBack={() => setEditor(null)} onSave={(name) => save(() => state.saveGroup({ id: editor.value?.id, name }))}/>;
  if (editor?.kind === "debt") return <DebtForm debt={editor.value} groups={state.groups} saving={saving} onBack={() => setEditor(null)} onSave={(value) => save(() => state.saveDebt({ ...value, id: editor.value?.id }))}/>;
  if (editor?.kind === "payment") return <DebtPaymentForm payment={editor.value} debts={state.debts} events={state.events} saving={saving} onBack={() => setEditor(null)} onSave={(value) => save(() => state.savePayment({ ...value, id: editor.value?.id }))}/>;
  if (editor?.kind === "reconciliation") return <DebtReconciliationForm reconciliation={editor.value} debtId={editor.debtId} debts={state.debts} saving={saving} onBack={() => setEditor(null)} onSave={(value) => save(() => state.saveReconciliation({ ...value, id: editor.value?.id }))}/>;
  if (selectedEvent) {
    const debt = state.debts.find((value) => value.id === selectedEvent.debtId);
    if (debt && selectedEvent.type === "reconciliation") return <DebtReconciliationDetailsPage debt={debt} reconciliation={selectedEvent} onBack={() => setSelectedEventId(null)} onEdit={() => { setSelectedEventId(null); setEditor({ kind: "reconciliation", value: selectedEvent }); }} onDelete={() => void (async () => { try { await state.deleteEvent(selectedEvent.id); setSelectedEventId(null); message.success(t("debt.deleted")); } catch { message.error(t("feedback.saveFailed")); } })()}/>;
    const breakdown = debt && selectedEvent.type === "payment" ? buildDebtProjection(debt, state.events).payments.find((value) => value.eventId === selectedEvent.id) : undefined;
    if (debt && selectedEvent.type === "payment" && breakdown) return <DebtPaymentDetailsPage debt={debt} payment={selectedEvent} breakdown={breakdown} onBack={() => setSelectedEventId(null)} onEdit={() => { setSelectedEventId(null); setEditor({ kind: "payment", value: selectedEvent }); }} onDelete={() => void (async () => { try { await state.deleteEvent(selectedEvent.id); setSelectedEventId(null); message.success(t("debt.deleted")); } catch { message.error(t("feedback.saveFailed")); } })()}/>;
  }
  if (selected) return <DebtDetailsPage debt={selected.debt} group={state.groups.find((group) => group.id === selected.debt.groupId)} projection={selected.projection} events={state.events.filter((event) => event.debtId === selected.debt.id)} onBack={() => setSelectedDebtId(null)} onEdit={() => setEditor({ kind: "debt", value: selected.debt })} onDelete={() => void (async () => { try { await state.deleteDebt(selected.debt.id); setSelectedDebtId(null); message.success(t("debt.deleted")); } catch { message.error(t("feedback.saveFailed")); } })()} onEditGroup={() => setEditor({ kind: "group", value: state.groups.find((group) => group.id === selected.debt.groupId) })} onReconcile={() => setEditor({ kind: "reconciliation", debtId: selected.debt.id })} onSelectEvent={setSelectedEventId}/>;

  return <>
    <section className="summary-header"><div className="summary-copy"><span>{t("debt.total")}</span><div className="summary-total"><strong>{formatMoney(total, displayCurrency)}</strong><CurrencySwitcher value={currencyMode} onChange={onCurrencyChange}/></div><small><span>{t("debt.count", { count: active.length })}</span><b aria-hidden="true">·</b><span>{t("debt.monthlyPayment")} {formatMoney(monthly, displayCurrency)}</span><b aria-hidden="true">·</b><span>{t("debt.accruedInterest")} {formatMoney(accrued, displayCurrency)}</span><b aria-hidden="true">·</b><span>{t("debt.remainingInterest")} {formatMoney(remainingInterest, displayCurrency)}</span></small></div><div className="quick-actions"><button type="button" onClick={() => setEditor({ kind: "group" })}><Plus size={16}/>{t("debt.group")}</button><button className="primary" type="button" disabled={!state.groups.length} onClick={() => setEditor({ kind: "debt" })}><Plus size={16}/>{t("debt.loan")}</button><button type="button" disabled={!state.debts.some((debt) => debt.status === "active")} onClick={() => setEditor({ kind: "payment" })}><Plus size={16}/>{t("debt.payment")}</button></div></section>
    <section className="filters"><div className="button-filter"><button className={groupFilter === "all" ? "active" : ""} onClick={() => setGroupFilter("all")}>{t("debt.allGroups")}</button>{state.groups.map((group) => <button className={groupFilter === group.id ? "active" : ""} key={group.id} onClick={() => setGroupFilter(group.id)}>{group.name}</button>)}</div><div className="button-filter"><button className={statusFilter === "active" ? "active" : ""} onClick={() => setStatusFilter("active")}>{t("debt.active")}</button><button className={statusFilter === "closed" ? "active" : ""} onClick={() => setStatusFilter("closed")}>{t("debt.closed")}</button></div>{new Set(state.debts.map((debt) => debt.loanType)).size > 1 ? <div className="button-filter"><button className={typeFilter === "all" ? "active" : ""} onClick={() => setTypeFilter("all")}>{t("debt.allTypes")}</button><button className={typeFilter === "consumer" ? "active" : ""} onClick={() => setTypeFilter("consumer")}>{t("debt.consumer")}</button><button className={typeFilter === "mortgage" ? "active" : ""} onClick={() => setTypeFilter("mortgage")}>{t("debt.mortgage")}</button></div> : null}</section>
    {trend.length || breakdown.length ? <div className="analytics-grid">{trend.length ? <section className="panel chart-panel"><h2>{t("debt.chart")}</h2><TrendChart buckets={trend} currency={displayCurrency} locale={locale} label={t("debt.chart")}/></section> : null}{breakdown.length ? <section className="panel category-panel"><h2>{t("debt.byGroup")}</h2>{breakdown.map((group) => <button type="button" key={group.id} onClick={() => setGroupFilter(group.id)}><i style={{ background: group.color }}/><span>{group.name}</span><strong>{formatMoney(group.value, displayCurrency)}</strong><small>{Math.round(group.value / breakdownTotal * 100)}%</small></button>)}</section> : null}</div> : null}
    <section className="history-section capital-list"><div className="section-heading"><h2>{t("debt.loans")}</h2><span>{visible.length}</span></div>{visible.map(({ debt, projection }) => <button className="capital-row capital-row-detailed" type="button" key={debt.id} onClick={() => setSelectedDebtId(debt.id)}><div><strong>{debt.name}</strong><span>{state.groups.find((group) => group.id === debt.groupId)?.name}{debt.lender ? ` · ${debt.lender}` : ""}</span><small>{t("debt.rate")}: {Number(debt.annualRate) * 100}% · {t("debt.remainingPayments")}: {projection.remainingPayments}</small></div><div><strong>{formatMoney(Number(projection.principal), debt.currency)}</strong><small>{t("debt.requiredPayment")}: {formatMoney(Number(projection.requiredPayment), debt.currency)}{projection.nextPaymentDate ? ` · ${projection.nextPaymentDate}` : ""}</small></div><ChevronRight size={16}/></button>)}</section>
  </>;
}
