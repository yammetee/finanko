import AntApp from "antd/es/app";
import { Check, ChevronRight, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useI18n } from "../../shared/i18n/i18nContext";
import { formatMoney } from "../../shared/lib/format";
import { SpendingChart } from "../expenses/SpendingChart";
import { CapitalAssetForm } from "./CapitalAssetForm";
import { CapitalAssetDetailsPage } from "./CapitalAssetDetailsPage";
import { CapitalEventForm } from "./CapitalEventForm";
import { CapitalGroupForm } from "./CapitalGroupForm";
import type { CapitalAssetSubmission } from "./capitalAssetSubmission";
import { sumCapitalValues } from "./capitalCurrency";
import { getCapitalEventLabel, getCapitalItemLabel } from "./capitalLabels";
import { useCapitalStore } from "./capitalStore";
import type { CapitalEvent, CapitalGroup, CapitalItem, CapitalItemType } from "./capitalTypes";
import { buildCapitalPositions } from "./capitalView";

type Editor = { kind: "group"; value?: CapitalGroup } | { kind: "item"; value?: CapitalItem } | { kind: "event"; value?: CapitalEvent } | null;
type TypeFilter = "all" | "market" | "crypto" | "cash";
const typeMatches = (type: CapitalItemType, filter: TypeFilter) => filter === "all" || (filter === "market" && (type === "stock" || type === "fund")) || type === filter || (filter === "cash" && type === "deposit");

export function CapitalPage({ ratesVersion }: { ratesVersion: number }) {
  const { message } = AntApp.useApp();
  const { locale, t } = useI18n();
  const state = useCapitalStore();
  const [editor, setEditor] = useState<Editor>(null);
  const [saving, setSaving] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const positions = useMemo(() => {
    void ratesVersion;
    return buildCapitalPositions(state.items, state.events, state.quotes);
  }, [ratesVersion, state.items, state.events, state.quotes]);
  const activeGroupFilter = groupFilter === "all" || state.groups.some((group) => group.id === groupFilter) ? groupFilter : "all";
  const hasTypeFilters = new Set(state.items.map((item) => item.type === "stock" || item.type === "fund" ? "market" : item.type === "deposit" ? "cash" : item.type)).size > 1;
  const visible = positions.filter(({ item }) => (activeGroupFilter === "all" || item.groupId === activeGroupFilter) && typeMatches(item.type, typeFilter));
  const selectedPosition = positions.find(({ item }) => item.id === selectedItemId);
  const total = sumCapitalValues(positions.map((value) => value.valueUsd));
  const invested = sumCapitalValues(positions.map((value) => value.costBasisUsd));
  const result = sumCapitalValues(positions.map((value) => value.profitUsd));
  const income = sumCapitalValues(positions.map((value) => value.incomeUsd));
  const pending = state.events.filter((event) => event.status === "expected");
  const capitalTrend = state.valuations.map((value) => ({ key: value.date, start: `${value.date}T00:00:00Z`, end: `${value.date}T23:59:59Z`, value: Number(value.totalUsd), expenseCount: 1, unit: "day" as const }));
  const eventValue = (event: CapitalEvent) => event.type === "split" ? `${event.splitRatio}×` : event.type === "transfer" && event.quantity ? event.quantity : event.amount ? formatMoney(Number(event.amount), event.currency) : event.quantity ?? "";

  const save = async (action: () => Promise<unknown>) => {
    setSaving(true);
    try { await action(); setEditor(null); message.success(t("capital.saved")); }
    catch { message.error(t("feedback.saveFailed")); }
    finally { setSaving(false); }
  };
  const saveAsset = (submission: CapitalAssetSubmission) => save(async () => {
    if (editor?.kind !== "item") return;
    if (editor.value) { await state.saveItem({ ...submission.item, id: editor.value.id }); return; }
    if (submission.openingInvested !== undefined) {
      await state.saveOpeningPosition(submission.item, submission.openingQuantity ?? "", submission.openingInvested, submission.occurredAt);
      return;
    }
    await state.saveItem(submission.item);
  });
  const runAction = async (action: () => Promise<unknown>, success: string) => {
    try { await action(); message.success(success); }
    catch { message.error(t("capital.actionError")); }
  };
  if (editor?.kind === "group") return <CapitalGroupForm group={editor.value} saving={saving} onBack={() => setEditor(null)} onSave={(name) => save(() => state.saveGroup({ id: editor.value?.id, name }))}/>;
  if (editor?.kind === "item") return <CapitalAssetForm key={editor.value?.id ?? "new"} item={editor.value} groups={state.groups} items={state.items} saving={saving} onBack={() => setEditor(null)} onSave={saveAsset}/>;
  if (editor?.kind === "event") return <CapitalEventForm key={editor.value?.id ?? "new"} event={editor.value} items={state.items} saving={saving} onBack={() => setEditor(null)} onSave={(value) => save(() => state.saveEvent({ ...value, id: editor.value?.id }))}/>;
  if (selectedPosition) {
    const openingType = selectedPosition.item.type === "cash" || selectedPosition.item.type === "deposit" ? "deposit" : "buy";
    const latestOpening = state.events.filter((event) => event.itemId === selectedPosition.item.id && event.status === "confirmed" && event.type === openingType).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0];
    return <CapitalAssetDetailsPage
      position={selectedPosition}
      groupName={state.groups.find((group) => group.id === selectedPosition.item.groupId)?.name}
      quoteUnavailable={state.unavailableQuoteItemIds.includes(selectedPosition.item.id) || selectedPosition.priceSource === "missing"}
      onBack={() => setSelectedItemId(null)}
      onEdit={() => latestOpening ? setEditor({ kind: "event", value: latestOpening }) : setEditor({ kind: "item", value: selectedPosition.item })}
      onDelete={() => void runAction(async () => { await state.deleteItem(selectedPosition.item.id); setSelectedItemId(null); }, t("capital.deleted"))}
    />;
  }

  return <>
    <section className="summary-header">
      <div className="summary-copy"><span>{t("capital.total")}</span><strong>{formatMoney(Number(total), "USD")}</strong><small><span>{t("capital.invested")} {formatMoney(Number(invested), "USD")}</span><b aria-hidden="true">·</b><span className={Number(result) < 0 ? "negative" : "positive"}>{t("capital.result")} {formatMoney(Number(result), "USD")}</span><b aria-hidden="true">·</b><span>{t("capital.income")} {formatMoney(Number(income), "USD")}</span></small></div>
      <div className="quick-actions"><button type="button" onClick={() => setEditor({ kind: "group" })}><Plus size={16}/>{t("capital.group.title")}</button><button className="primary" type="button" disabled={!state.groups.length} onClick={() => setEditor({ kind: "item" })}><Plus size={16}/>{t("capital.asset.title")}</button><button type="button" disabled={!state.items.length} onClick={() => setEditor({ kind: "event" })}><Plus size={16}/>{t("capital.event.title")}</button></div>
    </section>

    {state.groups.length > 1 || hasTypeFilters ? <section className="filters">{state.groups.length > 1 ? <div className="button-filter"><button aria-pressed={activeGroupFilter === "all"} className={activeGroupFilter === "all" ? "active" : ""} onClick={() => setGroupFilter("all")}>{t("capital.filters.allGroups")}</button>{state.groups.map((group) => <button aria-pressed={activeGroupFilter === group.id} className={activeGroupFilter === group.id ? "active" : ""} key={group.id} onClick={() => setGroupFilter(group.id)}>{group.name}</button>)}</div> : null}{hasTypeFilters ? <div className="button-filter">{(["all","market","crypto","cash"] as TypeFilter[]).map((type) => <button aria-pressed={typeFilter === type} className={typeFilter === type ? "active" : ""} key={type} onClick={() => setTypeFilter(type)}>{t(`capital.filters.${type}`)}</button>)}</div> : null}</section> : null}
    {capitalTrend.length ? <div className="analytics-grid"><section className="panel chart-panel"><h2>{t("capital.chart")}{state.historyLoading ? <RefreshCw className="spin" size={14}/> : null}</h2><SpendingChart buckets={capitalTrend} currency="USD" locale={locale} label={t("capital.chartLabel")}/></section></div> : null}
    {pending.length ? <section className="panel pending-events"><h2>{t("capital.pending")}</h2>{pending.map((event) => <div key={event.id}><span>{state.items.find((item) => item.id === event.itemId)?.name} · {getCapitalEventLabel(event.type, locale)} · {eventValue(event)}</span><button aria-label={t("actions.edit")} onClick={() => setEditor({ kind: "event", value: event })}><Pencil size={15}/></button><button aria-label={t("capital.confirm")} onClick={() => void runAction(() => state.setEventStatus(event.id, "confirmed"), t("capital.confirmed"))}><Check size={15}/></button><button aria-label={t("capital.ignore")} onClick={() => void runAction(() => state.setEventStatus(event.id, "ignored"), t("capital.ignored"))}><X size={15}/></button></div>)}</section> : null}
    <section className="history-section capital-list"><div className="section-heading"><h2>{t("capital.assets")}</h2><span>{visible.length}</span></div>{visible.map((position) => <button type="button" className="capital-row capital-row-detailed" key={position.item.id} onClick={() => setSelectedItemId(position.item.id)}><div><strong>{position.item.name}</strong><span>{state.groups.find((group) => group.id === position.item.groupId)?.name} · {position.item.symbol || getCapitalItemLabel(position.item.type, locale).toLocaleLowerCase(locale)}</span><small>{t("capital.asset.quantity")}: {position.quantity} · {t("capital.average")}: {formatMoney(Number(position.averageCost), position.item.quoteCurrency)}</small>{position.netIncome !== "0" ? <small>{t("capital.income")}: {formatMoney(Number(position.netIncome), position.item.quoteCurrency)}</small> : null}</div><div><strong>{formatMoney(position.value, position.item.quoteCurrency)}</strong>{state.unavailableQuoteItemIds.includes(position.item.id) || position.priceSource === "missing" ? <small className="negative">{t("capital.quoteStale")}</small> : null}<small className={position.profit < 0 ? "negative" : "positive"}>{t("capital.result")}: {formatMoney(position.profit, position.item.quoteCurrency)}</small></div><ChevronRight size={16}/></button>)}</section>
  </>;
}
