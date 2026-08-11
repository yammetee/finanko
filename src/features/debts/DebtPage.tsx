import { ChevronRight, Plus } from "lucide-react";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { CurrencySwitcher, type DisplayCurrency } from "../../shared/ui/CurrencySwitcher";
import { useFeedback } from "../../shared/ui/feedbackContext";
import { useI18n } from "../../shared/i18n/i18nContext";
import { convertMoney } from "../../shared/lib/currency";
import { formatMoney } from "../../shared/lib/format";
import type { Currency } from "../../shared/types/expense";
import { AnalyticsOverview } from "../../shared/ui/AnalyticsOverview";
import { buildDebtProjection } from "./debtMath";
import { DebtDetailsPage } from "./DebtDetailsPage";
import { DebtPaymentDetailsPage } from "./DebtPaymentDetailsPage";
import { DebtReconciliationDetailsPage } from "./DebtReconciliationDetailsPage";
import { useDebtStore } from "./debtStore";
import type { Debt, DebtEvent, DebtGroup, DebtPayment, DebtReconciliation } from "./debtTypes";
import { buildDebtPositions } from "./debtView";

type Editor = { kind: "group"; value?: DebtGroup } | { kind: "debt"; value?: Debt } | { kind: "payment"; value?: DebtPayment } | { kind: "reconciliation"; value?: DebtReconciliation; debtId?: string } | null;
const COLORS = ["#5a9feb", "#9b82e6", "#58b6ad", "#e8b94c", "#f07f86", "#c69b58"];
const DebtForm = lazy(() => import("./DebtForm").then((module) => ({ default: module.DebtForm })));
const DebtGroupForm = lazy(() => import("./DebtGroupForm").then((module) => ({ default: module.DebtGroupForm })));
const DebtPaymentForm = lazy(() => import("./DebtPaymentForm").then((module) => ({ default: module.DebtPaymentForm })));
const DebtReconciliationForm = lazy(() => import("./DebtReconciliationForm").then((module) => ({ default: module.DebtReconciliationForm })));
const editorFallback = <div className="parsing-state"><div className="auth-loader" /></div>;

export function DebtPage({ currencyMode, onCurrencyChange, ratesVersion, onDataChanged }: { currencyMode: DisplayCurrency; onCurrencyChange: (value: DisplayCurrency) => void; ratesVersion: number; onDataChanged: () => Promise<void> }) {
  const { message } = useFeedback();
  const { locale, t } = useI18n();
  const state = useDebtStore(useShallow((value) => ({
    groups: value.groups,
    debts: value.debts,
    events: value.events,
    saveGroup: value.saveGroup,
    saveDebt: value.saveDebt,
    savePayment: value.savePayment,
    saveReconciliation: value.saveReconciliation,
    deleteDebt: value.deleteDebt,
    deleteEvent: value.deleteEvent,
  })));
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
  const convert = useCallback((value: string, currency: Currency, date?: string) => {
    void ratesVersion;
    return convertMoney(Number(value), currency, displayCurrency, date);
  }, [displayCurrency, ratesVersion]);
  const active = useMemo(() => projections.filter(({ projection }) => projection.status === "active"), [projections]);
  const current = useMemo(() => projections.filter(({ projection }) => projection.status === statusFilter), [projections, statusFilter]);
  const visible = useMemo(() => current.filter(({ debt }) => (groupFilter === "all" || debt.groupId === groupFilter) && (typeFilter === "all" || debt.loanType === typeFilter)), [current, groupFilter, typeFilter]);
  const { total, monthly, accrued, remainingInterest } = useMemo(() => active.reduce((totals, { debt, projection }) => ({
    total: totals.total + convert(projection.principal, debt.currency),
    monthly: totals.monthly + convert(projection.requiredPayment, debt.currency),
    accrued: totals.accrued + convert(projection.accruedInterest, debt.currency),
    remainingInterest: totals.remainingInterest + convert(projection.futureInterest, debt.currency),
  }), { total: 0, monthly: 0, accrued: 0, remainingInterest: 0 }), [active, convert]);
  const breakdown = useMemo(() => state.groups.map((group, index) => ({ id: group.id, name: group.name, color: COLORS[index % COLORS.length], value: current.filter(({ debt }) => debt.groupId === group.id && (typeFilter === "all" || debt.loanType === typeFilter)).reduce((sum, { debt, projection }) => sum + convert(projection.principal, debt.currency), 0) })).filter((value) => value.value > 0).sort((left, right) => right.value - left.value), [convert, current, state.groups, typeFilter]);
  const breakdownTotal = breakdown.reduce((sum, value) => sum + value.value, 0);
  const eventsByDebt = useMemo(() => {
    const result = new Map<string, DebtEvent[]>();
    for (const event of state.events) {
      const debtEvents = result.get(event.debtId);
      if (debtEvents) debtEvents.push(event);
      else result.set(event.debtId, [event]);
    }
    return result;
  }, [state.events]);
  const trend = useMemo(() => {
    const dates = [...new Set([...state.debts.map((debt) => debt.balanceDate), ...state.events.map((event) => event.occurredAt.slice(0, 10))])].sort();
    return dates.map((date) => ({ key: date, start: `${date}T00:00:00Z`, end: `${date}T23:59:59Z`, value: state.debts.reduce((sum, debt) => {
      if (debt.balanceDate > date) return sum;
      const events = (eventsByDebt.get(debt.id) ?? []).filter((event) => event.occurredAt.slice(0, 10) <= date);
      return sum + convert(buildDebtProjection(debt, events, date).principal, debt.currency, date);
    }, 0), expenseCount: 1, unit: "day" as const }));
  }, [convert, eventsByDebt, state.debts, state.events]);
  const selected = useMemo(() => projections.find(({ debt }) => debt.id === selectedDebtId), [projections, selectedDebtId]);
  const selectedEvent = useMemo(() => state.events.find((event) => event.id === selectedEventId), [selectedEventId, state.events]);
  const groupsById = useMemo(() => new Map(state.groups.map((group) => [group.id, group])), [state.groups]);

  const save = async (action: () => Promise<unknown>) => {
    setSaving(true);
    try { await action(); await onDataChanged(); setEditor(null); message.success(t("debt.saved")); }
    catch { message.error(t("feedback.saveFailed")); }
    finally { setSaving(false); }
  };
  if (editor?.kind === "group") return <Suspense fallback={editorFallback}><DebtGroupForm group={editor.value} saving={saving} onBack={() => setEditor(null)} onSave={(name) => save(() => state.saveGroup({ id: editor.value?.id, name }))}/></Suspense>;
  if (editor?.kind === "debt") return <Suspense fallback={editorFallback}><DebtForm debt={editor.value} groups={state.groups} saving={saving} onBack={() => setEditor(null)} onSave={(value) => save(() => state.saveDebt({ ...value, id: editor.value?.id }))}/></Suspense>;
  if (editor?.kind === "payment") return <Suspense fallback={editorFallback}><DebtPaymentForm payment={editor.value} debts={state.debts} events={state.events} saving={saving} onBack={() => setEditor(null)} onSave={(value) => save(() => state.savePayment({ ...value, id: editor.value?.id }))}/></Suspense>;
  if (editor?.kind === "reconciliation") return <Suspense fallback={editorFallback}><DebtReconciliationForm reconciliation={editor.value} debtId={editor.debtId} debts={state.debts} saving={saving} onBack={() => setEditor(null)} onSave={(value) => save(() => state.saveReconciliation({ ...value, id: editor.value?.id }))}/></Suspense>;
  if (selectedEvent) {
    const debt = state.debts.find((value) => value.id === selectedEvent.debtId);
    if (debt && selectedEvent.type === "reconciliation") return <DebtReconciliationDetailsPage debt={debt} reconciliation={selectedEvent} onBack={() => setSelectedEventId(null)} onEdit={() => { setSelectedEventId(null); setEditor({ kind: "reconciliation", value: selectedEvent }); }} onDelete={() => void (async () => { try { await state.deleteEvent(selectedEvent.id); await onDataChanged(); setSelectedEventId(null); message.success(t("debt.deleted")); } catch { message.error(t("feedback.saveFailed")); } })()}/>;
    const breakdown = debt && selectedEvent.type === "payment" ? buildDebtProjection(debt, state.events).payments.find((value) => value.eventId === selectedEvent.id) : undefined;
    if (debt && selectedEvent.type === "payment" && breakdown) return <DebtPaymentDetailsPage debt={debt} payment={selectedEvent} breakdown={breakdown} onBack={() => setSelectedEventId(null)} onEdit={() => { setSelectedEventId(null); setEditor({ kind: "payment", value: selectedEvent }); }} onDelete={() => void (async () => { try { await state.deleteEvent(selectedEvent.id); await onDataChanged(); setSelectedEventId(null); message.success(t("debt.deleted")); } catch { message.error(t("feedback.saveFailed")); } })()}/>;
  }
  if (selected) return <DebtDetailsPage debt={selected.debt} group={groupsById.get(selected.debt.groupId)} projection={selected.projection} events={eventsByDebt.get(selected.debt.id) ?? []} onBack={() => setSelectedDebtId(null)} onEdit={() => setEditor({ kind: "debt", value: selected.debt })} onDelete={() => void (async () => { try { await state.deleteDebt(selected.debt.id); await onDataChanged(); setSelectedDebtId(null); message.success(t("debt.deleted")); } catch { message.error(t("feedback.saveFailed")); } })()} onEditGroup={() => setEditor({ kind: "group", value: groupsById.get(selected.debt.groupId) })} onReconcile={() => setEditor({ kind: "reconciliation", debtId: selected.debt.id })} onSelectEvent={setSelectedEventId}/>;

  return <>
    <section className="summary-header"><div className="summary-copy"><span>{t("debt.total")}</span><div className="summary-total"><strong>{formatMoney(total, displayCurrency)}</strong><CurrencySwitcher value={currencyMode} onChange={onCurrencyChange}/></div><small><span>{t("debt.count", { count: active.length })}</span><b aria-hidden="true">·</b><span>{t("debt.monthlyPayment")} {formatMoney(monthly, displayCurrency)}</span><b aria-hidden="true">·</b><span>{t("debt.accruedInterest")} {formatMoney(accrued, displayCurrency)}</span><b aria-hidden="true">·</b><span>{t("debt.remainingInterest")} {formatMoney(remainingInterest, displayCurrency)}</span></small></div><div className="quick-actions"><button type="button" onClick={() => setEditor({ kind: "group" })}><Plus size={16}/>{t("debt.group")}</button><button className="primary" type="button" disabled={!state.groups.length} onClick={() => setEditor({ kind: "debt" })}><Plus size={16}/>{t("debt.loan")}</button><button type="button" disabled={!state.debts.some((debt) => debt.status === "active")} onClick={() => setEditor({ kind: "payment" })}><Plus size={16}/>{t("debt.payment")}</button></div></section>
    <section className="filters"><div className="button-filter"><button className={groupFilter === "all" ? "active" : ""} onClick={() => setGroupFilter("all")}>{t("debt.allGroups")}</button>{state.groups.map((group) => <button className={groupFilter === group.id ? "active" : ""} key={group.id} onClick={() => setGroupFilter(group.id)}>{group.name}</button>)}</div><div className="button-filter"><button className={statusFilter === "active" ? "active" : ""} onClick={() => setStatusFilter("active")}>{t("debt.active")}</button><button className={statusFilter === "closed" ? "active" : ""} onClick={() => setStatusFilter("closed")}>{t("debt.closed")}</button></div>{new Set(state.debts.map((debt) => debt.loanType)).size > 1 ? <div className="button-filter"><button className={typeFilter === "all" ? "active" : ""} onClick={() => setTypeFilter("all")}>{t("debt.allTypes")}</button><button className={typeFilter === "consumer" ? "active" : ""} onClick={() => setTypeFilter("consumer")}>{t("debt.consumer")}</button><button className={typeFilter === "mortgage" ? "active" : ""} onClick={() => setTypeFilter("mortgage")}>{t("debt.mortgage")}</button></div> : null}</section>
    {trend.length || breakdown.length ? <AnalyticsOverview buckets={trend} currency={displayCurrency} locale={locale} chartTitle={t("debt.chart")} chartLabel={t("debt.chart")} breakdownTitle={t("debt.byGroup")}>
      {breakdown.map((group) => <button type="button" key={group.id} onClick={() => setGroupFilter(group.id)}><i style={{ background: group.color }}/><span>{group.name}</span><strong>{formatMoney(group.value, displayCurrency)}</strong><small>{Math.round(group.value / breakdownTotal * 100)}%</small></button>)}
    </AnalyticsOverview> : null}
    <section className="history-section capital-list"><div className="section-heading"><h2>{t("debt.loans")}</h2><span>{visible.length}</span></div>{visible.map(({ debt, projection }) => <button className="capital-row capital-row-detailed" type="button" key={debt.id} onClick={() => setSelectedDebtId(debt.id)}><div><strong>{debt.name}</strong><span>{groupsById.get(debt.groupId)?.name}{debt.lender ? ` · ${debt.lender}` : ""}</span><small>{t("debt.rate")}: {Number(debt.annualRate) * 100}% · {t("debt.remainingPayments")}: {projection.remainingPayments}</small></div><div><strong>{formatMoney(Number(projection.principal), debt.currency)}</strong><small>{t("debt.requiredPayment")}: {formatMoney(Number(projection.requiredPayment), debt.currency)}{projection.nextPaymentDate ? ` · ${projection.nextPaymentDate}` : ""}</small></div><ChevronRight size={16}/></button>)}</section>
  </>;
}
