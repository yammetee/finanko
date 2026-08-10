import dayjs from "dayjs";
import { Camera, FileText, PenLine } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { DEFAULT_CURRENCY } from "../../shared/constants/expenses";
import { getCategoryName } from "../../shared/i18n/displayText";
import { useI18n } from "../../shared/i18n/i18nContext";
import { formatMoney } from "../../shared/lib/format";
import type { Expense } from "../../shared/types/expense";
import { CurrencySwitcher, type DisplayCurrency } from "../../shared/ui/CurrencySwitcher";
import { useFeedback } from "../../shared/ui/feedbackContext";
import { loadTrendChart } from "../../shared/ui/trendChartModule";
import type { ParsedExpense } from "../receipts/expenseParser";
import { isDefaultExpenseCategory, sortDefaultExpenseCategories } from "./categoryData";
import { ExpenseDetailsPage } from "./ExpenseDetailsPage";
import type { ExpenseFormMode } from "./ExpenseFormPage";
import { ExpenseRows } from "./ExpenseRows";
import {
  buildExpenseCategoryGroups,
  buildExpenseTrendBuckets,
  buildExpenseView,
  calculateAverageDailyExpense,
  categoryGroupKey,
  getExpensePeriodRange,
  type ExpenseFilters,
  type ExpensePeriod,
} from "./expenseAnalytics";
import { createEmptyExpenseDraft, expenseFormToInputs, type ExpenseDraft, type ExpenseFormValues } from "./expenseDraft";
import { useExpenseStore } from "./expenseStore";

const ExpenseFormPage = lazy(() => import("./ExpenseFormPage").then((module) => ({ default: module.ExpenseFormPage })));
const ExpenseDateRange = lazy(() => import("./ExpenseDateRange").then((module) => ({ default: module.ExpenseDateRange })));
const TrendChart = lazy(() => loadTrendChart().then((module) => ({ default: module.TrendChart })));
const PERIODS: ExpensePeriod[] = ["today", "week", "month", "year", "all", "custom"];
const MOBILE_CATEGORY_LIMIT = 5;
const HISTORY_LIMIT = 8;

function receiptErrorKey(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "file_too_large" || code === "compressed_file_too_large") return "receipt.fileTooLarge" as const;
  if (code === "unsupported_file" || code === "unsupported_image") return "receipt.unsupported" as const;
  if (code === "ai_daily_limit") return "ai.dailyLimit" as const;
  if (code === "receipt_incomplete") return "receipt.incomplete" as const;
  return "receipt.parseError" as const;
}

interface ExpensesPageProps { currencyMode: DisplayCurrency; onCurrencyChange: (value: DisplayCurrency) => void; ratesVersion: number; capitalTotalUsd?: string; debtTotalUsd?: number }

export function ExpensesPage({ currencyMode, onCurrencyChange, ratesVersion, capitalTotalUsd, debtTotalUsd }: ExpensesPageProps) {
  const { message } = useFeedback();
  const { locale, t } = useI18n();
  const expenseState = useExpenseStore(useShallow((state) => ({
    categories: state.categories,
    expenses: state.expenses,
    trackingStartedAt: state.trackingStartedAt,
    loadState: state.loadState,
    rangeLoading: state.rangeLoading,
    loadedRangeKey: state.loadedRangeKey,
    retry: state.retry,
    loadRange: state.loadRange,
    addExpenses: state.addExpenses,
    updateExpense: state.updateExpense,
    deleteExpense: state.deleteExpense,
  })));
  const expensesReady = expenseState.loadState === "ready";
  const expensesFailed = expenseState.loadState === "error";
  const expensesLoading = expenseState.loadState === "idle" || expenseState.loadState === "loading" || expenseState.rangeLoading;
  const loadExpenseRange = expenseState.loadRange;
  const expenseLoadState = expenseState.loadState;
  const receiptInput = useRef<HTMLInputElement>(null);
  const [formMode, setFormMode] = useState<ExpenseFormMode | null>(null);
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [selected, setSelected] = useState<Expense | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ExpenseFilters>({ period: "month", categoryKeys: [] });
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  useEffect(() => {
    setShowAllHistory(false);
  }, [filters.period, filters.categoryKeys, filters.customRange]);

  const requestedRange = useMemo(() => {
    const range = getExpensePeriodRange(filters);
    return range ? { start: range.start.toISOString(), end: range.end.toISOString() } : {};
  }, [filters]);
  useEffect(() => {
    if (expenseLoadState === "ready") void loadExpenseRange(requestedRange).catch(() => undefined);
  }, [expenseLoadState, loadExpenseRange, requestedRange]);

  const expenseCategories = expenseState.categories;
  const primaryCategories = useMemo(
    () => sortDefaultExpenseCategories(expenseCategories.filter(isDefaultExpenseCategory)),
    [expenseCategories],
  );
  const formCategories = primaryCategories;
  const baseCurrency = DEFAULT_CURRENCY;
  const otherCategory = primaryCategories.find((category) => category.name.trim().toLocaleLowerCase() === "other");
  const analyticsCategories = useMemo(() => expenseCategories.map((category) => isDefaultExpenseCategory(category) ? category : { ...category, name: "Other", color: otherCategory?.color ?? "#8c8c8c" }), [expenseCategories, otherCategory?.color]);
  const categoryGroups = useMemo(() => buildExpenseCategoryGroups(analyticsCategories, (category) => getCategoryName(category, t)), [analyticsCategories, t]);
  const requestedDisplayCurrency = currencyMode === "native" ? baseCurrency : currencyMode;
  const displayCurrency = requestedDisplayCurrency;
  const expenseView = useMemo(() => {
    void ratesVersion;
    return buildExpenseView({ expenses: expenseState.expenses, categories: analyticsCategories, categoryGroups, filters, displayCurrency });
  }, [analyticsCategories, categoryGroups, displayCurrency, expenseState.expenses, filters, ratesVersion]);
  const categoryNames = useMemo(() => new Map(categoryGroups.map((group) => [group.key, group.name])), [categoryGroups]);
  const otherKey = categoryGroupKey("Other");
  const categoryAmounts = useMemo(() => currencyMode === "native"
    ? expenseView.nativeByCategory
    : expenseView.byCategory.map((item) => ({
      ...item,
      currency: displayCurrency,
      convertedValue: item.value,
    })), [currencyMode, displayCurrency, expenseView.byCategory, expenseView.nativeByCategory]);
  const breakdown = useMemo(() => categoryAmounts.reduce<Array<(typeof categoryAmounts)[number]>>((items, item) => {
    const key = item.key;
    const existing = items.find((candidate) => candidate.key === key && candidate.currency === item.currency);
    if (existing) {
      existing.value += item.value;
      existing.convertedValue += item.convertedValue;
      return items;
    }
    items.push({ ...item, key, color: key === otherKey ? otherCategory?.color ?? "#8c8c8c" : item.color, name: categoryNames.get(key) ?? (key === otherKey ? t("category.other") : item.name) });
    return items;
  }, []).sort((left, right) => Math.abs(right.convertedValue) - Math.abs(left.convertedValue)), [categoryAmounts, categoryNames, otherCategory?.color, otherKey, t]);
  const breakdownTotal = breakdown.reduce((sum, item) => sum + Math.abs(item.convertedValue), 0);
  const average = useMemo(() => calculateAverageDailyExpense(
    expenseView.history,
    filters,
    expenseView.total,
    dayjs(),
    expenseState.trackingStartedAt,
  ), [expenseState.trackingStartedAt, expenseView.history, expenseView.total, filters]);
  const totalLabel = expensesReady ? formatMoney(expenseView.total, displayCurrency) : "—";
  const averageLabel = expensesReady ? formatMoney(average, displayCurrency) : "—";
  const trend = useMemo(() => buildExpenseTrendBuckets(expenseView.history, filters), [expenseView.history, filters]);
  const selectedCategory = categoryGroups.find((group) => {
    return filters.categoryKeys.includes(group.key);
  })?.key ?? "";
  const visibleHistory = useMemo(() => showAllHistory ? expenseView.history : expenseView.history.slice(0, HISTORY_LIMIT), [expenseView.history, showAllHistory]);
  const hiddenHistoryCount = Math.max(0, expenseView.history.length - HISTORY_LIMIT);

  function closeForm() { setFormMode(null); setDraft(null); setEditing(null); setParseError(null); setParsing(false); }
  function openManual() { setEditing(null); setFormMode("manual"); setParseError(null); setDraft(createEmptyExpenseDraft(baseCurrency, primaryCategories[0]?.id)); }
  function openText() { setEditing(null); setFormMode("text"); setParseError(null); setDraft(null); }

  async function handleReceipt(file: File) {
    setEditing(null); setFormMode("receipt"); setDraft(null); setParseError(null); setParsing(true);
    try {
      const [{ parseReceiptInput }, { prepareReceiptImage }] = await Promise.all([
        import("../receipts/aiParser"),
        import("../receipts/receiptImage"),
      ]);
      const parsed = await parseReceiptInput({ fileName: file.name, fileDataUrl: await prepareReceiptImage(file), currency: baseCurrency, categories: primaryCategories });
      const items = parsed.items.map((item) => ({ ...item, currency: item.currency ?? parsed.currency }));
      setDraft(parsed.items.length > 0
        ? { currency: parsed.currency, occurredAt: dayjs(), source: "receipt_ai", items, receiptReview: parsed.receiptReview }
        : { ...createEmptyExpenseDraft(parsed.currency, primaryCategories[0]?.id, { name: parsed.description }), source: "receipt_ai", receiptReview: parsed.receiptReview });
    } catch (error) {
      setParseError(t(receiptErrorKey(error)));
      setDraft({ ...createEmptyExpenseDraft(baseCurrency, primaryCategories[0]?.id, { name: file.name }), source: "receipt_ai" });
    } finally { setParsing(false); if (receiptInput.current) receiptInput.current.value = ""; }
  }

  async function handleText(text: string) {
    setParsing(true); setParseError(null);
    const input = { text, currency: baseCurrency, categories: primaryCategories };
    try {
      const [{ parseTextInput }, { parseTextInputLocally }] = await Promise.all([
        import("../receipts/aiParser"),
        import("../receipts/expenseParser"),
      ]);
      const parsed = await parseTextInput(input).catch(() => parseTextInputLocally(input));
      const expense = parsed as ParsedExpense;
      const categoryId = expense.items[0]?.categoryId ?? primaryCategories[0]?.id;
      const items = expense.items.map((item) => ({ ...item, currency: item.currency ?? expense.currency }));
      setDraft(expense.items.length > 0
        ? { currency: expense.currency, occurredAt: dayjs(), source: "text_ai", items, receiptReview: expense.receiptReview }
        : { ...createEmptyExpenseDraft(expense.currency, categoryId, { name: expense.description || text, amount: expense.total || undefined }), source: "text_ai", receiptReview: expense.receiptReview });
    } catch {
      const { detectAmountInText, detectCurrencyInText } = await import("../receipts/expenseParser");
      setParseError(t("expense.parserSuggestionOnly"));
      setDraft({ ...createEmptyExpenseDraft(detectCurrencyInText(text) ?? baseCurrency, primaryCategories[0]?.id, { name: text, amount: detectAmountInText(text) ?? undefined }), source: "text_ai" });
    } finally { setParsing(false); }
  }

  function openEdit(expense: Expense) {
    setEditing(expense); setSelected(null); setFormMode("edit"); setParseError(null);
    setDraft({ currency: expense.currency, occurredAt: dayjs(expense.occurredAt), source: expense.source, items: [{ name: expense.description || t("expense.untitled"), amount: expense.amount, currency: expense.currency, categoryId: expense.categoryId }] });
  }

  async function saveExpense(values: ExpenseFormValues) {
    if (formCategories.length === 0) { message.error(t("expense.contextUnavailable")); return; }
    const inputs = expenseFormToInputs(values);
    setSaving(true);
    try {
      if (editing) { await expenseState.updateExpense(editing.id, inputs[0]); message.success(t("expense.updated")); }
      else { await expenseState.addExpenses(inputs); message.success(t("expense.saved")); }
      closeForm();
    } catch { message.error(t("feedback.saveFailed")); }
    finally { setSaving(false); }
  }

  async function deleteExpense(expense: Expense) {
    try { await expenseState.deleteExpense(expense.id); setSelected(null); message.success(t("expense.deleted")); }
    catch { message.error(t("feedback.saveFailed")); }
  }

  function chooseCategory(key: string) {
    setFilters((current) => ({ ...current, categoryKeys: key ? [key] : [] }));
  }

  const home = (
    <div className="expenses-home" aria-busy={expensesLoading}>
      <section className="summary-header">
        <div className="summary-copy"><span>{t("expense.spent")}</span><div className="summary-total"><strong>{totalLabel}</strong><CurrencySwitcher value={currencyMode} onChange={onCurrencyChange}/></div><small><span>{expensesReady ? t("expense.count", { count: expenseView.history.length }) : "—"}</span><b aria-hidden="true">·</b><span>{t("expense.averageDailyExpense")} {averageLabel}</span><b aria-hidden="true">·</b><span className="summary-async-metric">{t("capital.total")} {capitalTotalUsd === undefined ? "—" : formatMoney(Number(capitalTotalUsd), "USD")}</span><b aria-hidden="true">·</b><span className="summary-async-metric">{t("debt.total")} {debtTotalUsd === undefined ? "—" : formatMoney(debtTotalUsd, "USD")}</span></small></div>
        <div className="quick-actions">
          <button className="primary" disabled={!expensesReady} type="button" onClick={() => receiptInput.current?.click()}><Camera size={17} />{t("inputMode.receipt")}</button>
          <button disabled={!expensesReady} type="button" onClick={openText}><FileText size={17} />{t("inputMode.text")}</button>
          <button disabled={!expensesReady} type="button" onClick={openManual}><PenLine size={17} />{t("inputMode.manual")}</button>
        </div>
      </section>

      <section className="filters" aria-label={t("expense.period")}>
        <div className="button-filter period-filter">{PERIODS.map((period) => <button className={filters.period === period ? "active" : ""} aria-pressed={filters.period === period} disabled={!expensesReady} key={period} type="button" onClick={() => setFilters((current) => ({ ...current, period, customRange: period === "custom" && !current.customRange ? [dayjs().startOf("month").toISOString(), dayjs().endOf("day").toISOString()] : current.customRange }))}>{t(`expense.period.${period}`)}</button>)}</div>
        <div className={`button-filter category-filter${showAllCategories ? " expanded" : ""}`}>
          <button className={selectedCategory === "" ? "active" : ""} disabled={!expensesReady} type="button" onClick={() => chooseCategory("")}>{t("expense.allCategories")}</button>
          {categoryGroups.map((group, index) => <button className={`${selectedCategory === group.key ? "active" : ""}${index >= MOBILE_CATEGORY_LIMIT ? " category-extra" : ""}`} disabled={!expensesReady} key={group.key} type="button" onClick={() => chooseCategory(group.key)}><i style={{ background: group.color }} />{group.name}</button>)}
          {categoryGroups.length > MOBILE_CATEGORY_LIMIT ? <button className="category-toggle" disabled={!expensesReady} type="button" aria-expanded={showAllCategories} onClick={() => setShowAllCategories((value) => !value)}>{showAllCategories ? t("actions.collapse") : t("actions.more", { count: categoryGroups.length - MOBILE_CATEGORY_LIMIT })}</button> : null}
        </div>
        {filters.period === "custom" ? <Suspense fallback={<div className="date-range date-range-placeholder" aria-hidden="true" />}><ExpenseDateRange label={t("expense.period.custom")} value={filters.customRange} onChange={(customRange) => setFilters((current) => ({ ...current, customRange }))} /></Suspense> : null}
      </section>

      {!expensesReady || expenseView.history.length > 0 ? (
        <div className="analytics-grid">
          <section className="panel chart-panel"><h2>{t("expense.trend")}</h2>{expensesReady ? <Suspense fallback={<div className="chart" aria-hidden="true" />}><TrendChart buckets={trend} currency={displayCurrency} locale={locale} label={t("expense.trend")} /></Suspense> : <div className="chart" aria-hidden="true" />}</section>
          <section className="panel category-panel"><h2>{t("section.expensesByCategory")}</h2>{breakdown.map((item) => { const share = breakdownTotal > 0 ? Math.round(Math.abs(item.convertedValue) / breakdownTotal * 100) : 0; return <button type="button" key={`${item.key}:${item.currency}`} onClick={() => chooseCategory(item.key)}><i style={{ background: item.color }} /><span>{item.name}</span><strong>{formatMoney(item.value, item.currency)}</strong><small>{share}%</small></button>; })}</section>
        </div>
      ) : null}

      <section className="history-section">
        <div className="section-heading"><h2>{t("expense.history")}</h2><span>{expensesReady ? expenseView.history.length : "—"}</span></div>
        {expensesFailed ? <><p className="muted">{t("feedback.loadFailed")}</p><button className="history-toggle" type="button" onClick={() => void expenseState.retry()}>{t("actions.retry")}</button></> : null}
        {expensesReady ? <ExpenseRows entries={visibleHistory} displayCurrency={currencyMode === "native" ? "native" : displayCurrency} onSelect={setSelected} /> : null}
        {hiddenHistoryCount > 0 ? <button className="history-toggle" type="button" aria-expanded={showAllHistory} onClick={() => setShowAllHistory((value) => !value)}>{showAllHistory ? t("actions.collapse") : t("actions.showMore", { count: hiddenHistoryCount })}</button> : null}
      </section>
    </div>
  );

  return (
    <>
      <input ref={receiptInput} aria-label={t("inputMode.receipt")} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleReceipt(file); }} />
      {formMode ? <Suspense fallback={<div className="parsing-state">{t("expense.loadingEditor")}</div>}><ExpenseFormPage mode={formMode} draft={draft} categories={formCategories} parsing={parsing} saving={saving} parseError={parseError} onBack={closeForm} onParseText={handleText} onSave={saveExpense} /></Suspense> : selected ? <ExpenseDetailsPage expense={selected} categories={analyticsCategories} onBack={() => setSelected(null)} onEdit={() => openEdit(selected)} onDelete={() => void deleteExpense(selected)} /> : home}
    </>
  );
}
