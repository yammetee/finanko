import { Check, ChevronRight, Pencil, Plus, X } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "../../shared/i18n/i18nContext";
import { convertMoney } from "../../shared/lib/currency";
import { formatMoney } from "../../shared/lib/format";
import { CurrencySwitcher, type DisplayCurrency } from "../../shared/ui/CurrencySwitcher";
import { useFeedback } from "../../shared/ui/feedbackContext";
import { CapitalAssetDetailsPage } from "./CapitalAssetDetailsPage";
import type { CapitalAssetSubmission } from "./capitalAssetSubmission";
import { sumCapitalValues } from "./capitalCurrency";
import { getCapitalEventLabel, getCapitalItemLabel } from "./capitalLabels";
import { useCapitalStore } from "./capitalStore";
import type { CapitalEvent, CapitalGroup, CapitalItem, CapitalItemType } from "./capitalTypes";
import { buildCapitalPositions } from "./capitalView";

type Editor = { kind: "group"; value?: CapitalGroup } | { kind: "item"; value?: CapitalItem } | { kind: "event"; value?: CapitalEvent } | null;
type TypeFilter = "all" | "market" | "crypto" | "cash";
const GROUP_COLORS = ["#5a9feb", "#58b6ad", "#e8b94c", "#9b82e6", "#f07f86", "#c69b58", "#65a9d8", "#e58aa8"];
const typeMatches = (type: CapitalItemType, filter: TypeFilter) => filter === "all" || (filter === "market" && (type === "stock" || type === "fund")) || type === filter || (filter === "cash" && type === "deposit");
const assetMonogram = (item: CapitalItem) => (item.symbol || item.name).trim().slice(0, 2).toLocaleUpperCase();
const CapitalAssetForm = lazy(() => import("./CapitalAssetForm").then((module) => ({ default: module.CapitalAssetForm })));
const CapitalEventForm = lazy(() => import("./CapitalEventForm").then((module) => ({ default: module.CapitalEventForm })));
const CapitalGroupForm = lazy(() => import("./CapitalGroupForm").then((module) => ({ default: module.CapitalGroupForm })));
const editorFallback = <div className="parsing-state"><div className="auth-loader" /></div>;

export function CapitalPage({ ratesVersion, debtTotalUsd, currencyMode, onCurrencyChange, onCapitalTotalChanged }: { ratesVersion: number; debtTotalUsd?: number; currencyMode: DisplayCurrency; onCurrencyChange: (value: DisplayCurrency) => void; onCapitalTotalChanged: (value: string) => void }) {
  const { message } = useFeedback();
  const { locale, t } = useI18n();
  const state = useCapitalStore(useShallow((value) => ({
    groups: value.groups,
    items: value.items,
    events: value.events,
    quotes: value.quotes,
    unavailableQuoteItemIds: value.unavailableQuoteItemIds,
    saveGroup: value.saveGroup,
    saveItem: value.saveItem,
    saveOpeningPosition: value.saveOpeningPosition,
    saveEvent: value.saveEvent,
    deleteItem: value.deleteItem,
    setEventStatus: value.setEventStatus,
  })));
  const [editor, setEditor] = useState<Editor>(null);
  const [saving, setSaving] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const positions = useMemo(() => {
    void ratesVersion;
    return buildCapitalPositions(state.items, state.events, state.quotes);
  }, [ratesVersion, state.items, state.events, state.quotes]);
  const displayCurrency = currencyMode === "native" ? "USD" : currencyMode;
  const displayUsd = useCallback((value: string | number) => {
    void ratesVersion;
    return convertMoney(Number(value), "USD", displayCurrency);
  }, [displayCurrency, ratesVersion]);
  const activeGroupFilter = useMemo(() => groupFilter === "all" || state.groups.some((group) => group.id === groupFilter) ? groupFilter : "all", [groupFilter, state.groups]);
  const hasTypeFilters = useMemo(() => new Set(state.items.map((item) => item.type === "stock" || item.type === "fund" ? "market" : item.type === "deposit" ? "cash" : item.type)).size > 1, [state.items]);
  const visible = useMemo(() => positions.filter(({ item }) => (activeGroupFilter === "all" || item.groupId === activeGroupFilter) && typeMatches(item.type, typeFilter)), [activeGroupFilter, positions, typeFilter]);
  const selectedPosition = useMemo(() => positions.find(({ item }) => item.id === selectedItemId), [positions, selectedItemId]);
  const { total, invested, result, income } = useMemo(() => ({
    total: sumCapitalValues(positions.map((value) => value.valueUsd)),
    invested: sumCapitalValues(positions.map((value) => value.costBasisUsd)),
    result: sumCapitalValues(positions.map((value) => value.profitUsd)),
    income: sumCapitalValues(positions.map((value) => value.incomeUsd)),
  }), [positions]);
  useEffect(() => { onCapitalTotalChanged(total); }, [onCapitalTotalChanged, total]);
  const groupBreakdown = useMemo(() => state.groups.map((group, index) => ({
    id: group.id,
    name: group.name,
    color: GROUP_COLORS[index % GROUP_COLORS.length],
    value: displayUsd(sumCapitalValues(positions.filter(({ item }) => item.groupId === group.id && typeMatches(item.type, typeFilter)).map((position) => position.valueUsd))),
  })).filter((group) => group.value !== 0).sort((left, right) => Math.abs(right.value) - Math.abs(left.value)), [displayUsd, positions, state.groups, typeFilter]);
  const groupBreakdownTotal = groupBreakdown.reduce((sum, group) => sum + Math.abs(group.value), 0);
  const pending = useMemo(() => state.events.filter((event) => event.status === "expected"), [state.events]);
  const groupsById = useMemo(() => new Map(state.groups.map((group) => [group.id, group])), [state.groups]);
  const itemsById = useMemo(() => new Map(state.items.map((item) => [item.id, item])), [state.items]);
  const unavailableQuoteItemIds = useMemo(() => new Set(state.unavailableQuoteItemIds), [state.unavailableQuoteItemIds]);
  const eventValue = (event: CapitalEvent) => event.type === "split" ? `${event.splitRatio}×` : event.type === "transfer" && event.quantity ? event.quantity : event.amount ? formatMoney(Number(event.amount), event.currency) : event.quantity ?? "";

  const save = async (action: () => Promise<unknown>) => {
    setSaving(true);
    try {
      await action();
      setEditor(null);
      message.success(t("capital.saved"));
    }
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
    try {
      await action();
      message.success(success);
    }
    catch { message.error(t("capital.actionError")); }
  };
  if (editor?.kind === "group") return <Suspense fallback={editorFallback}><CapitalGroupForm group={editor.value} saving={saving} onBack={() => setEditor(null)} onSave={(name) => save(() => state.saveGroup({ id: editor.value?.id, name }))}/></Suspense>;
  if (editor?.kind === "item") return <Suspense fallback={editorFallback}><CapitalAssetForm key={editor.value?.id ?? "new"} item={editor.value} groups={state.groups} items={state.items} saving={saving} onBack={() => setEditor(null)} onSave={saveAsset}/></Suspense>;
  if (editor?.kind === "event") return <Suspense fallback={editorFallback}><CapitalEventForm key={editor.value?.id ?? "new"} event={editor.value} items={state.items} saving={saving} onBack={() => setEditor(null)} onSave={(value) => save(() => state.saveEvent({ ...value, id: editor.value?.id }))}/></Suspense>;
  if (selectedPosition) {
    const openingType = selectedPosition.item.type === "cash" || selectedPosition.item.type === "deposit" ? "deposit" : "buy";
    const latestOpening = state.events.filter((event) => event.itemId === selectedPosition.item.id && event.status === "confirmed" && event.type === openingType).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0];
    return <CapitalAssetDetailsPage
      position={selectedPosition}
      groupName={groupsById.get(selectedPosition.item.groupId)?.name}
      quoteUnavailable={unavailableQuoteItemIds.has(selectedPosition.item.id)}
      onBack={() => setSelectedItemId(null)}
      onEdit={() => latestOpening ? setEditor({ kind: "event", value: latestOpening }) : setEditor({ kind: "item", value: selectedPosition.item })}
      onDelete={() => void runAction(async () => { await state.deleteItem(selectedPosition.item.id); setSelectedItemId(null); }, t("capital.deleted"))}
    />;
  }

  return <>
    <section className="summary-header">
      <div className="summary-copy"><span>{t("capital.total")}</span><div className="summary-total"><strong>{formatMoney(displayUsd(total), displayCurrency)}</strong><CurrencySwitcher value={currencyMode} onChange={onCurrencyChange}/></div><small><span>{t("capital.invested")} {formatMoney(displayUsd(invested), displayCurrency)}</span><b aria-hidden="true">·</b><span className={Number(result) < 0 ? "negative" : "positive"}>{t("capital.result")} {formatMoney(displayUsd(result), displayCurrency)}</span><b aria-hidden="true">·</b><span>{t("capital.income")} {formatMoney(displayUsd(income), displayCurrency)}</span><b aria-hidden="true">·</b><span className="summary-async-metric">{t("debt.total")} {debtTotalUsd === undefined ? "—" : formatMoney(displayUsd(debtTotalUsd), displayCurrency)}</span></small></div>
      <div className="quick-actions"><button type="button" onClick={() => setEditor({ kind: "group" })}><Plus size={16}/>{t("capital.group.title")}</button><button className="primary" type="button" disabled={!state.groups.length} onClick={() => setEditor({ kind: "item" })}><Plus size={16}/>{t("capital.asset.title")}</button><button type="button" disabled={!state.items.length} onClick={() => setEditor({ kind: "event" })}><Plus size={16}/>{t("capital.event.title")}</button></div>
    </section>

    {state.groups.length > 1 || hasTypeFilters ? <section className="filters">{state.groups.length > 1 ? <div className="button-filter"><button aria-pressed={activeGroupFilter === "all"} className={activeGroupFilter === "all" ? "active" : ""} onClick={() => setGroupFilter("all")}>{t("capital.filters.allGroups")}</button>{state.groups.map((group) => <button aria-pressed={activeGroupFilter === group.id} className={activeGroupFilter === group.id ? "active" : ""} key={group.id} onClick={() => setGroupFilter(group.id)}>{group.name}</button>)}</div> : null}{hasTypeFilters ? <div className="button-filter">{(["all","market","crypto","cash"] as TypeFilter[]).map((type) => <button aria-pressed={typeFilter === type} className={typeFilter === type ? "active" : ""} key={type} onClick={() => setTypeFilter(type)}>{t(`capital.filters.${type}`)}</button>)}</div> : null}</section> : null}
    {groupBreakdown.length ? <div className="analytics-grid"><section className="panel category-panel"><h2>{t("capital.byGroup")}</h2>{groupBreakdown.map((group) => { const share = groupBreakdownTotal > 0 ? Math.round(Math.abs(group.value) / groupBreakdownTotal * 100) : 0; return <button type="button" key={group.id} onClick={() => setGroupFilter(group.id)}><i style={{ background: group.color }}/><span>{group.name}</span><strong>{formatMoney(group.value, displayCurrency)}</strong><small>{share}%</small></button>; })}</section></div> : null}
    {pending.length ? <section className="panel pending-events"><h2>{t("capital.pending")}</h2>{pending.map((event) => <div key={event.id}><span>{itemsById.get(event.itemId)?.name} · {getCapitalEventLabel(event.type, locale)} · {eventValue(event)}</span><button aria-label={t("actions.edit")} onClick={() => setEditor({ kind: "event", value: event })}><Pencil size={15}/></button><button aria-label={t("capital.confirm")} onClick={() => void runAction(() => state.setEventStatus(event.id, "confirmed"), t("capital.confirmed"))}><Check size={15}/></button><button aria-label={t("capital.ignore")} onClick={() => void runAction(() => state.setEventStatus(event.id, "ignored"), t("capital.ignored"))}><X size={15}/></button></div>)}</section> : null}
    <section className="history-section capital-list"><div className="section-heading"><h2>{t("capital.assets")}</h2><span>{visible.length}</span></div>{visible.map((position) => { const logoUrl = state.quotes[position.item.id]?.logoUrl; return <button type="button" className="capital-row capital-row-detailed" key={position.item.id} onClick={() => setSelectedItemId(position.item.id)}><span className="capital-asset-icon" aria-hidden="true"><span>{assetMonogram(position.item)}</span>{logoUrl ? <img key={logoUrl} src={logoUrl} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }}/>: null}</span><div><strong>{position.item.name}</strong><span>{groupsById.get(position.item.groupId)?.name} · {position.item.symbol || getCapitalItemLabel(position.item.type, locale).toLocaleLowerCase(locale)}</span><small>{t("capital.asset.quantity")}: {position.quantity} · {t("capital.average")}: {formatMoney(Number(position.averageCost), position.item.quoteCurrency)}</small>{position.netIncome !== "0" ? <small>{t("capital.income")}: {formatMoney(Number(position.netIncome), position.item.quoteCurrency)}</small> : null}</div><div><strong>{formatMoney(position.value, position.item.quoteCurrency)}</strong>{unavailableQuoteItemIds.has(position.item.id) ? <small className="negative">{t("capital.quoteUnavailable")}</small> : null}<small className={position.profit < 0 ? "negative" : "positive"}>{t("capital.result")}: {formatMoney(position.profit, position.item.quoteCurrency)}</small></div><ChevronRight size={16}/></button>; })}</section>
  </>;
}
