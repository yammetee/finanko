import AntApp from "antd/es/app";
import { Archive, ArrowLeft, Check, Pencil, Plus, RefreshCw, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CURRENCIES } from "../../shared/constants/expenses";
import { useI18n } from "../../shared/i18n/i18nContext";
import { formatMoney } from "../../shared/lib/format";
import type { Currency } from "../../shared/types/expense";
import { ChoiceGroup } from "../../shared/ui/ChoiceGroup";
import { CurrencyIcon } from "../../shared/ui/CurrencyIcon";
import { buildCapitalPositions } from "./capitalView";
import { useCapitalStore } from "./capitalStore";
import type { CapitalAssetSuggestion, CapitalEvent, CapitalEventStatus, CapitalEventType, CapitalGroup, CapitalItem, CapitalItemType } from "./capitalTypes";
import { CapitalChart } from "./CapitalChart";
import { getCapitalEventLabel, getCapitalItemLabel } from "./capitalLabels";
import { percentInputToRate, rateToPercentInput } from "./capitalRates";
import { sumCapitalValues } from "./capitalCurrency";
import { searchMarketAssets } from "./marketRepository";

interface Props { onBack: () => void }
type Editor = "group" | "item" | "event" | null;
type TypeFilter = "all" | "market" | "crypto" | "cash";
const EVENT_TYPES: CapitalEventType[] = ["buy", "sell", "deposit", "withdrawal", "transfer", "dividend", "interest", "staking", "fee", "tax", "split", "adjustment"];
const ITEM_TYPES: CapitalItemType[] = ["stock", "fund", "crypto", "cash", "deposit"];

const eventUsesQuantity = (type: CapitalEventType) => ["buy", "sell", "deposit", "withdrawal", "transfer", "staking", "adjustment"].includes(type);
const eventUsesPrice = (type: CapitalEventType) => ["buy", "sell", "staking"].includes(type);
const eventUsesAmount = (type: CapitalEventType) => type !== "split";
const eventRequiresQuantity = (type: CapitalEventType) => ["buy", "sell", "staking"].includes(type);
const eventRequiresAmount = (type: CapitalEventType) => ["dividend", "interest", "fee", "tax"].includes(type);
const eventAllowsQuantityOrAmount = (type: CapitalEventType) => ["deposit", "withdrawal", "transfer", "adjustment"].includes(type);
const typeMatches = (type: CapitalItemType, filter: TypeFilter) => filter === "all" || (filter === "market" && (type === "stock" || type === "fund")) || type === filter || (filter === "cash" && type === "deposit");

export function CapitalPage({ onBack }: Props) {
  const { message } = AntApp.useApp();
  const { locale } = useI18n();
  const ru = locale === "ru";
  const eventLabel = (type: CapitalEventType) => getCapitalEventLabel(type, locale);
  const state = useCapitalStore();
  const [editor, setEditor] = useState<Editor>(null);
  const [editingId, setEditingId] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [groupFilter, setGroupFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [groupId, setGroupId] = useState("");
  const [itemId, setItemId] = useState("");
  const [relatedItemId, setRelatedItemId] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [provider, setProvider] = useState<CapitalItem["primaryProvider"]>();
  const [providerAssetId, setProviderAssetId] = useState("");
  const [itemType, setItemType] = useState<CapitalItemType>("stock");
  const [interestRate, setInterestRate] = useState("");
  const [eventType, setEventType] = useState<CapitalEventType>("buy");
  const [status, setStatus] = useState<CapitalEventStatus>("confirmed");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("");
  const [tax, setTax] = useState("");
  const [splitRatio, setSplitRatio] = useState("");
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [eventReinvest, setEventReinvest] = useState(false);
  const [externalProvider, setExternalProvider] = useState<string>();
  const [externalId, setExternalId] = useState<string>();
  const [openingQuantity, setOpeningQuantity] = useState("");
  const [openingInvested, setOpeningInvested] = useState("");
  const [assetQuery, setAssetQuery] = useState("");
  const [assetSuggestions, setAssetSuggestions] = useState<CapitalAssetSuggestion[]>([]);
  const [assetSearchLoading, setAssetSearchLoading] = useState(false);

  const activeGroups = state.groups.filter((group) => !group.archivedAt);
  const activeItems = state.items.filter((item) => !item.archivedAt);
  const positions = useMemo(() => buildCapitalPositions(activeItems, state.events, state.quotes), [activeItems, state.events, state.quotes]);
  const visible = positions.filter(({ item }) => (groupFilter === "all" || item.groupId === groupFilter) && typeMatches(item.type, typeFilter));
  const total = sumCapitalValues(positions.map((value) => value.valueUsd));
  const invested = sumCapitalValues(visible.map((value) => value.costBasisUsd));
  const result = sumCapitalValues(visible.map((value) => value.profitUsd));
  const income = sumCapitalValues(visible.map((value) => value.incomeUsd));
  const pending = state.events.filter((event) => event.status === "expected" && !event.deletedAt);
  const history = state.events.filter((event) => event.status !== "expected" && !event.deletedAt).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const archivedItems = state.items.filter((item) => item.archivedAt);
  const archivedGroups = state.groups.filter((group) => group.archivedAt);

  useEffect(() => {
    if (editor !== "item" || editingId || assetQuery.trim().length < 2) { setAssetSuggestions([]); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      setAssetSearchLoading(true);
      void searchMarketAssets(assetQuery.trim()).then((values) => { if (active) setAssetSuggestions(values); }).catch(() => { if (active) setAssetSuggestions([]); }).finally(() => { if (active) setAssetSearchLoading(false); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [assetQuery, editingId, editor]);

  const reset = () => { setEditor(null); setEditingId(undefined); setName(""); setSymbol(""); setProvider(undefined); setProviderAssetId(""); setInterestRate(""); setQuantity(""); setAmount(""); setPrice(""); setFee(""); setTax(""); setSplitRatio(""); setRelatedItemId(""); setStatus("confirmed"); setEventReinvest(false); setExternalProvider(undefined); setExternalId(undefined); setOpeningQuantity(""); setOpeningInvested(""); setAssetQuery(""); setAssetSuggestions([]); setOccurredAt(new Date().toISOString().slice(0, 10)); };
  const applySuggestion = (value: CapitalAssetSuggestion) => { setName(value.name); setSymbol(value.symbol); setItemType(value.type); setProvider(value.provider); setProviderAssetId(value.providerAssetId); setCurrency("USD"); setAssetQuery(""); setAssetSuggestions([]); };
  const chooseItemType = (value: string) => {
    const type = value as CapitalItemType;
    if (type !== itemType) { setSymbol(""); setProvider(undefined); setProviderAssetId(""); setPrice(""); }
    setItemType(type);
  };
  const openGroup = (value?: CapitalGroup) => { reset(); setEditingId(value?.id); setName(value?.name ?? ""); setEditor("group"); };
  const openItem = (value?: CapitalItem) => { reset(); setEditingId(value?.id); setGroupId(value?.groupId ?? activeGroups[0]?.id ?? ""); setName(value?.name ?? ""); setSymbol(value?.symbol ?? ""); setProvider(value?.primaryProvider); setProviderAssetId(value?.primaryAssetId ?? ""); setItemType(value?.type ?? "stock"); setCurrency(value?.quoteCurrency ?? "USD"); setPrice(value?.manualPrice ?? ""); setInterestRate(rateToPercentInput(value?.annualInterestRate)); setEditor("item"); };
  const openEvent = (value?: CapitalEvent) => { reset(); setEditingId(value?.id); setItemId(value?.itemId ?? activeItems[0]?.id ?? ""); setRelatedItemId(value?.relatedItemId ?? ""); setEventType(value?.type ?? "buy"); setStatus(value?.status ?? "confirmed"); setOccurredAt((value?.occurredAt ?? new Date().toISOString()).slice(0, 10)); setQuantity(value?.quantity ?? ""); setAmount(value?.amount ?? ""); setPrice(value?.unitPrice ?? ""); setFee(value?.fee ?? ""); setTax(value?.tax ?? ""); setSplitRatio(value?.splitRatio ?? ""); setCurrency(value?.currency ?? "USD"); setEventReinvest(value?.reinvest ?? false); setExternalProvider(value?.externalProvider); setExternalId(value?.externalId); setEditor("event"); };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      if (editor === "group") await state.saveGroup({ id: editingId, name });
      if (editor === "item") {
        const primaryProvider = provider ?? (symbol && (itemType === "stock" || itemType === "fund") ? "nasdaq" : symbol && itemType === "crypto" ? "bybit" : undefined);
        const primaryAssetId = providerAssetId || (primaryProvider === "bybit" ? `${symbol.toUpperCase()}USDT` : symbol) || undefined;
        const existing = editingId ? state.items.find((value) => value.id === editingId) : undefined;
        const item = { groupId, name, symbol: symbol || undefined, type: itemType, quoteCurrency: currency, manualPrice: price || (itemType === "cash" || itemType === "deposit" ? "1" : undefined), primaryProvider, primaryAssetId, fallbackProvider: existing?.fallbackProvider, fallbackAssetId: existing?.fallbackAssetId, annualInterestRate: percentInputToRate(interestRate), interestCadence: interestRate ? existing?.interestCadence ?? "monthly" as const : undefined, interestEffectiveFrom: interestRate ? existing?.interestEffectiveFrom ?? new Date().toISOString().slice(0, 10) : undefined, interestCompounding: interestRate ? existing?.interestCompounding ?? false : false, incomeDestinationItemId: interestRate ? existing?.incomeDestinationItemId : undefined, defaultTaxRate: interestRate ? existing?.defaultTaxRate : undefined };
        if (!editingId && openingInvested) await state.saveOpeningPosition(item, openingQuantity, openingInvested, new Date(`${occurredAt}T12:00:00`).toISOString());
        else await state.saveItem({ ...item, id: editingId });
      }
      if (editor === "event") await state.saveEvent({ id: editingId, itemId, relatedItemId: relatedItemId || undefined, type: eventType, status, occurredAt: new Date(`${occurredAt}T12:00:00`).toISOString(), quantity: quantity || undefined, amount: amount || undefined, unitPrice: price || undefined, fee: fee || undefined, tax: tax || undefined, splitRatio: splitRatio || undefined, currency, source: externalProvider ? "automatic" : "manual", reinvest: eventReinvest, externalProvider, externalId });
      reset(); message.success(ru ? "Сохранено" : "Saved");
    } catch { message.error(ru ? "Не удалось сохранить" : "Could not save"); }
    finally { setSaving(false); }
  };

  return <div className="capital-page">
    <div className="page-heading"><button type="button" aria-label={ru ? "Назад" : "Back"} onClick={onBack}><ArrowLeft /></button><h1>{ru ? "Капитал" : "Capital"}</h1></div>
    <section className="capital-summary"><span>{ru ? "Общий капитал" : "Total capital"}</span><strong>{formatMoney(Number(total), "USD")}</strong><div className="capital-stats"><small>{ru ? "Вложено" : "Invested"}<b>{formatMoney(Number(invested), "USD")}</b></small><small>{ru ? "Результат" : "Result"}<b className={Number(result) < 0 ? "negative" : "positive"}>{formatMoney(Number(result), "USD")}</b></small><small>{ru ? "Доход" : "Income"}<b>{formatMoney(Number(income), "USD")}</b></small></div></section>
    {state.loadState === "loading" ? <div aria-live="polite" className="capital-notice" role="status">{ru ? "Загружаю капитал…" : "Loading capital…"}</div> : null}
    {state.loadState === "error" ? <div className="capital-notice" role="alert"><span>{ru ? "Капитал пока недоступен. Расходы продолжают работать." : "Capital is unavailable. Expenses still work."}</span><button type="button" onClick={() => void state.initialize()}>{ru ? "Повторить" : "Retry"}</button></div> : null}
    {state.quotesError ? <div className="capital-notice" role="alert"><span>{ru ? "Не удалось обновить цены. Используются последние сохранённые или ручные значения." : "Prices could not be refreshed. Saved or manual values are still in use."}</span><button type="button" onClick={() => void state.refreshQuotes()}>{ru ? "Повторить" : "Retry"}</button></div> : null}
    {!state.quotesError && state.quotesPartial ? <div aria-live="polite" className="capital-notice" role="status">{ru ? "Часть цен недоступна — для них используются последние сохранённые или ручные значения." : "Some prices are unavailable; saved or manual values are being used."}</div> : null}
    <div className="capital-actions"><button type="button" onClick={() => openGroup()}><Plus size={16}/>{ru ? "Группа" : "Group"}</button><button type="button" disabled={!activeGroups.length} onClick={() => openItem()}><Plus size={16}/>{ru ? "Актив" : "Asset"}</button><button type="button" disabled={!activeItems.length} onClick={() => openEvent()}><Plus size={16}/>{ru ? "Операция" : "Event"}</button><button type="button" disabled={state.quotesLoading || !activeItems.some((item) => item.symbol)} onClick={() => void state.refreshQuotes()}><RefreshCw className={state.quotesLoading ? "spin" : ""} size={16}/>{ru ? "Цены" : "Prices"}</button></div>

    {editor ? <form className="capital-editor panel" onSubmit={submit}>
      <h2>{editingId ? (ru ? "Редактирование" : "Edit") : editor === "group" ? (ru ? "Новая группа" : "New group") : editor === "item" ? (ru ? "Новый актив" : "New asset") : (ru ? "Новая операция" : "New event")}</h2>
      {editor === "item" && !editingId ? <div className="capital-asset-search"><label>{ru ? "Найти акцию, фонд или криптовалюту" : "Find a stock, fund, or cryptocurrency"}<input autoComplete="off" value={assetQuery} onChange={(event) => setAssetQuery(event.target.value)} placeholder="Bitcoin, BTC, Apple, AAPL…"/></label>{assetSearchLoading ? <small aria-live="polite">{ru ? "Ищу…" : "Searching…"}</small> : null}{assetSuggestions.length ? <div className="capital-search-results">{assetSuggestions.map((value) => <button key={`${value.provider}:${value.providerAssetId}`} type="button" onClick={() => applySuggestion(value)}><strong>{value.name}</strong><span>{value.symbol} · {getCapitalItemLabel(value.type, locale)}</span></button>)}</div> : null}</div> : null}
      {editor === "group" ? <label>{ru ? "Название" : "Name"}<input required value={name} onChange={(e) => setName(e.target.value)} /></label> : null}
      {editor === "item" ? <>
        <ChoiceGroup label={ru ? "Что добавляем" : "Asset type"} value={itemType} onChange={chooseItemType} options={ITEM_TYPES.map((type) => ({ value: type, label: getCapitalItemLabel(type, locale) }))}/>
        <label>{ru ? "Название" : "Name"}<input required value={name} onChange={(e) => setName(e.target.value)} placeholder={itemType === "cash" ? (ru ? "Рубли наличными" : "Cash") : itemType === "deposit" ? (ru ? "Вклад" : "Deposit") : undefined}/></label>
        {activeGroups.length > 1 ? <label>{ru ? "Где находится" : "Portfolio"}<select value={groupId} onChange={(e) => setGroupId(e.target.value)}>{activeGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label> : null}
        {itemType !== "cash" && itemType !== "deposit" ? <label>{ru ? "Тикер" : "Ticker"}<input required value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder={itemType === "crypto" ? "BTC" : "AAPL"}/></label> : null}
        <ChoiceGroup label={ru ? "Валюта" : "Currency"} value={currency} onChange={(value) => setCurrency(value as Currency)} options={CURRENCIES.map((value) => ({ value, label: <><CurrencyIcon currency={value} size={12}/>{value}</> }))}/>
        {itemType === "deposit" ? <label>{ru ? "Годовая ставка, если есть" : "Annual rate, if any"}<input value={interestRate} inputMode="decimal" placeholder="12" onChange={(e) => setInterestRate(e.target.value)} /></label> : null}
        {editingId && itemType !== "cash" && itemType !== "deposit" && !provider ? <label>{ru ? "Цена вручную, если API не используется" : "Manual price when no API is used"}<input value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} /></label> : null}
      </> : null}
      {editor === "item" && !editingId ? <fieldset className="capital-opening"><legend>{ru ? "Сколько у тебя сейчас" : "Current position"}</legend>{itemType !== "cash" && itemType !== "deposit" ? <label>{ru ? "Количество" : "Quantity"}<input value={openingQuantity} inputMode="decimal" onChange={(e) => setOpeningQuantity(e.target.value)} /></label> : null}<label>{itemType === "cash" || itemType === "deposit" ? (ru ? "Баланс" : "Balance") : (ru ? "Всего вложено" : "Total invested")}<input value={openingInvested} inputMode="decimal" onChange={(e) => setOpeningInvested(e.target.value)} /></label><label>{ru ? "На какую дату" : "As of date"}<input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} /></label></fieldset> : null}
      {editor === "event" ? <><label>{ru ? "Актив" : "Asset"}<select value={itemId} onChange={(e) => setItemId(e.target.value)}>{activeItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{ru ? "Операция" : "Event"}<select value={eventType} onChange={(e) => setEventType(e.target.value as CapitalEventType)}>{EVENT_TYPES.map((type) => <option key={type} value={type}>{eventLabel(type)}</option>)}</select></label><label>{ru ? "Дата" : "Date"}<input required type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} /></label><label>{ru ? "Связанный актив (необязательно)" : "Related asset (optional)"}<select value={relatedItemId} onChange={(e) => setRelatedItemId(e.target.value)}><option value="">—</option>{activeItems.filter((item) => item.id !== itemId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{eventUsesQuantity(eventType) ? <label>{ru ? "Количество" : "Quantity"}<input required={eventRequiresQuantity(eventType) || (eventAllowsQuantityOrAmount(eventType) && !amount)} value={quantity} inputMode="decimal" onChange={(e) => setQuantity(e.target.value)} /></label> : null}{eventUsesAmount(eventType) ? <label>{eventType === "staking" ? (ru ? "Стоимость на момент получения" : "Fair value at receipt") : (ru ? "Сумма" : "Amount")}<input required={eventRequiresAmount(eventType) || (eventUsesPrice(eventType) && !price) || (eventAllowsQuantityOrAmount(eventType) && !quantity)} value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} /></label> : null}</> : null}
      {editor === "event" ? <><label>{ru ? "Валюта" : "Currency"}<select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>{CURRENCIES.map((value) => <option key={value}>{value}</option>)}</select></label>{eventUsesPrice(eventType) ? <label>{ru ? "Цена за единицу" : "Unit price"}<input required={!amount} value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} /></label> : null}</> : null}
      {editor === "event" ? <>{eventType === "split" ? <label>{ru ? "Коэффициент сплита" : "Split ratio"}<input required value={splitRatio} inputMode="decimal" onChange={(e) => setSplitRatio(e.target.value)} /></label> : null}<label>{ru ? "Комиссия" : "Fee"}<input value={fee} inputMode="decimal" onChange={(e) => setFee(e.target.value)} /></label><label>{ru ? "Налог" : "Tax"}<input value={tax} inputMode="decimal" onChange={(e) => setTax(e.target.value)} /></label></> : null}
      <div className="capital-editor-actions"><button type="button" onClick={reset}>{ru ? "Отмена" : "Cancel"}</button><button className="primary" disabled={saving} type="submit">{ru ? "Сохранить" : "Save"}</button></div>
    </form> : null}

    {pending.length ? <section className="panel pending-events"><h2>{ru ? "Ожидают подтверждения" : "Pending confirmation"}</h2>{pending.map((event) => <div key={event.id}><span>{activeItems.find((item) => item.id === event.itemId)?.name} · {eventLabel(event.type)} · {event.amount ?? event.quantity}</span><button aria-label={ru ? "Изменить" : "Edit"} onClick={() => openEvent(event)}><Pencil size={15}/></button><button aria-label={ru ? "Подтвердить" : "Confirm"} onClick={() => void state.setEventStatus(event.id, "confirmed")}><Check size={15}/></button><button aria-label={ru ? "Игнорировать" : "Ignore"} onClick={() => void state.setEventStatus(event.id, "ignored")}><X size={15}/></button></div>)}</section> : null}

    {state.valuations.length ? <section className="panel chart-panel"><h2>{ru ? "Динамика капитала" : "Capital dynamics"}{state.historyLoading ? <RefreshCw className="spin" size={14}/> : null}</h2><CapitalChart values={state.valuations} locale={locale} label={ru ? "Динамика капитала за всё время" : "All-time capital dynamics"}/></section> : null}

    {activeGroups.length > 1 || activeItems.length ? <section className="capital-filters"><div className="button-filter">{activeGroups.length > 1 ? <><button aria-pressed={groupFilter === "all"} className={groupFilter === "all" ? "active" : ""} onClick={() => setGroupFilter("all")}>{ru ? "Все группы" : "All groups"}</button>{activeGroups.map((group) => <button aria-pressed={groupFilter === group.id} className={groupFilter === group.id ? "active" : ""} key={group.id} onClick={() => setGroupFilter(group.id)}>{group.name}</button>)}</> : null}</div><div className="button-filter">{(["all","market","crypto","cash"] as TypeFilter[]).map((type) => <button aria-pressed={typeFilter === type} className={typeFilter === type ? "active" : ""} key={type} onClick={() => setTypeFilter(type)}>{{ all: ru ? "Все" : "All", market: ru ? "Акции и фонды" : "Stocks & funds", crypto: ru ? "Крипта" : "Crypto", cash: ru ? "Деньги и вклады" : "Cash & deposits" }[type]}</button>)}</div></section> : null}

    <section className="capital-list"><div className="section-heading"><h2>{ru ? "Активы" : "Assets"}</h2><span>{visible.length}</span></div>{visible.length === 0 ? <div className="capital-empty">{activeItems.length ? (ru ? "Нет активов по выбранному фильтру" : "No matching assets") : (ru ? "Создай группу, затем добавь первый актив" : "Create a group, then add your first asset")}</div> : visible.map((position) => <article className="capital-row capital-row-detailed" key={position.item.id}><div><strong>{position.item.name}</strong><span>{activeGroups.find((group) => group.id === position.item.groupId)?.name} · {position.item.symbol || getCapitalItemLabel(position.item.type, locale).toLocaleLowerCase(locale)}</span><small>{ru ? "Количество" : "Quantity"}: {position.quantity} · {ru ? "Средняя" : "Average"}: {formatMoney(Number(position.averageCost), position.item.quoteCurrency)}</small></div><div><strong>{formatMoney(position.value, position.item.quoteCurrency)}</strong><span>{ru ? "Цена" : "Price"}: {formatMoney(position.price, position.item.quoteCurrency)}</span><small className={state.unavailableQuoteItemIds.includes(position.item.id) || position.quoteStale ? "negative" : undefined}>{state.unavailableQuoteItemIds.includes(position.item.id) ? (ru ? "API недоступен — показана последняя сохранённая или ручная цена" : "API unavailable — showing the last saved or manual price") : position.priceSource === "market" ? `${position.quoteStale ? (ru ? "цена неактуальна" : "price is stale") + " · " : ""}${position.quote?.provider} · ${new Date(position.quote!.quotedAt).toLocaleString()}` : position.priceSource === "manual" ? (ru ? "ручная цена" : "manual price") : (ru ? "цена не указана" : "price missing")}</small><small className={position.profit < 0 ? "negative" : "positive"}>{ru ? "Результат" : "Result"}: {formatMoney(position.profit, position.item.quoteCurrency)}</small></div><div className="capital-row-actions"><button aria-label={ru ? "Изменить" : "Edit"} onClick={() => openItem(position.item)}><Pencil size={15}/></button><button aria-label={ru ? "Архивировать" : "Archive"} onClick={() => void state.archiveItem(position.item.id)}><Archive size={15}/></button></div></article>)}</section>
    {history.length ? <section className="capital-history"><div className="section-heading"><h2>{ru ? "Операции" : "Events"}</h2><span>{history.length}</span></div>{history.map((event) => <div className="capital-event-row" key={event.id}><div><strong>{activeItems.find((item) => item.id === event.itemId)?.name ?? state.items.find((item) => item.id === event.itemId)?.name}</strong><span>{eventLabel(event.type)} · {new Date(event.occurredAt).toLocaleDateString()}</span></div><b>{event.amount ? formatMoney(Number(event.amount), event.currency) : event.quantity}</b><button aria-label={ru ? "Изменить" : "Edit"} onClick={() => openEvent(event)}><Pencil size={15}/></button><button aria-label={ru ? "Аннулировать" : "Void"} onClick={() => void state.voidEvent(event.id)}><Trash2 size={15}/></button></div>)}</section> : null}
    {activeGroups.length ? <section className="capital-groups"><div className="section-heading"><h2>{ru ? "Группы" : "Groups"}</h2><span>{activeGroups.length}</span></div>{activeGroups.map((group) => <div key={group.id}><span>{group.name}</span><button aria-label={ru ? "Изменить группу" : "Edit group"} onClick={() => openGroup(group)}><Pencil size={15}/></button><button aria-label={ru ? "Архивировать группу" : "Archive group"} onClick={() => void state.archiveGroup(group.id)}><Trash2 size={15}/></button></div>)}</section> : null}
    {archivedItems.length || archivedGroups.length ? <section className="capital-archive panel"><h2>{ru ? "Архив" : "Archive"}</h2>{archivedGroups.map((group) => <div key={group.id}><span>{group.name} · {ru ? "группа" : "group"}</span><button onClick={() => void state.archiveGroup(group.id)}><RotateCcw size={15}/>{ru ? "Восстановить" : "Restore"}</button></div>)}{archivedItems.filter((item) => !state.groups.find((group) => group.id === item.groupId)?.archivedAt).map((item) => <div key={item.id}><span>{item.name}</span><button onClick={() => void state.archiveItem(item.id)}><RotateCcw size={15}/>{ru ? "Восстановить" : "Restore"}</button></div>)}</section> : null}
  </div>;
}
