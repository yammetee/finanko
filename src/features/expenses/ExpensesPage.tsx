import AntApp from "antd/es/app";
import DatePicker from "antd/es/date-picker";
import dayjs from "dayjs";
import { Camera, FileText, LogOut, PenLine } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CURRENCIES, DEFAULT_CURRENCY } from "../../shared/constants/expenses";
import { getCategoryName } from "../../shared/i18n/displayText";
import { useI18n } from "../../shared/i18n/i18nContext";
import { refreshLiveExchangeRates } from "../../shared/lib/exchangeRates";
import { formatMoney } from "../../shared/lib/format";
import { isValidMoneyDecimal } from "../../shared/lib/money";
import { CurrencyIcon, NativeCurrencyIcon } from "../../shared/ui/CurrencyIcon";
import type { Currency, Expense } from "../../shared/types/expense";
import { useAuthStore } from "../auth/authStore";
import { parseReceiptInput, parseTextInput } from "../receipts/aiParser";
import { detectAmountInText, detectCurrencyInText, parseTextInputLocally, type ParsedExpense } from "../receipts/expenseParser";
import { prepareReceiptImage } from "../receipts/receiptImage";
import { isDefaultExpenseCategory, sortDefaultExpenseCategories } from "./categoryData";
import { ExpenseDetailsPage } from "./ExpenseDetailsPage";
import { ExpenseFormPage, type ExpenseFormMode } from "./ExpenseFormPage";
import { ExpenseRows } from "./ExpenseRows";
import { SpendingChart } from "./SpendingChart";
import {
  buildExpenseCategoryGroups,
  buildExpenseTrendBuckets,
  buildExpenseView,
  calculateAverageDailyExpense,
  categoryGroupKey,
  getExpenseTrackingStart,
  UNALLOCATED_CATEGORY_KEY,
  type ExpenseFilters,
  type ExpensePeriod,
} from "./expenseAnalytics";
import { createEmptyExpenseDraft, expenseFormToInput, type ExpenseDraft, type ExpenseFormValues } from "./expenseDraft";
import { useExpenseStore } from "./expenseStore";

const { RangePicker } = DatePicker;
const PERIODS: ExpensePeriod[] = ["today", "week", "month", "year", "all", "custom"];
const MOBILE_CATEGORY_LIMIT = 5;
const HISTORY_LIMIT = 8;
type DisplayCurrency = Currency | "native";

function receiptErrorKey(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "file_too_large" || code === "compressed_file_too_large") return "receipt.fileTooLarge" as const;
  if (code === "unsupported_file" || code === "unsupported_image") return "receipt.unsupported" as const;
  if (code === "ai_daily_limit") return "ai.dailyLimit" as const;
  if (code === "receipt_incomplete") return "receipt.incomplete" as const;
  return "receipt.parseError" as const;
}

export function ExpensesPage() {
  const { message } = AntApp.useApp();
  const { locale, setLocale, t } = useI18n();
  const signOut = useAuthStore((state) => state.signOut);
  const expenseState = useExpenseStore();
  const receiptInput = useRef<HTMLInputElement>(null);
  const [formMode, setFormMode] = useState<ExpenseFormMode | null>(null);
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [selected, setSelected] = useState<Expense | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [ratesVersion, setRatesVersion] = useState(0);
  const [currencyMode, setCurrencyMode] = useState<DisplayCurrency>("native");
  const [filters, setFilters] = useState<ExpenseFilters>({ period: "month", categoryKeys: [] });
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  useEffect(() => {
    let active = true;
    void refreshLiveExchangeRates().then((updated) => { if (active && updated) setRatesVersion((value) => value + 1); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setShowAllHistory(false);
  }, [filters.period, filters.categoryKeys, filters.customRange]);

  const expenseCategories = expenseState.categories;
  const primaryCategories = useMemo(
    () => sortDefaultExpenseCategories(expenseCategories.filter(isDefaultExpenseCategory)),
    [expenseCategories],
  );
  const formCategories = primaryCategories;
  const baseCurrency = DEFAULT_CURRENCY;
  const currencyModes: DisplayCurrency[] = ["native", ...CURRENCIES];
  const nextCurrency = currencyModes[(currencyModes.indexOf(currencyMode) + 1) % currencyModes.length];
  const currentCurrencyLabel = currencyMode === "native" ? t("currency.native") : currencyMode;
  const nextCurrencyLabel = nextCurrency === "native" ? t("currency.native") : nextCurrency;
  const otherCategory = primaryCategories.find((category) => category.name.trim().toLocaleLowerCase() === "other");
  const analyticsCategories = useMemo(() => expenseCategories.map((category) => isDefaultExpenseCategory(category) ? category : { ...category, name: "Other", color: otherCategory?.color ?? "#8c8c8c" }), [expenseCategories, otherCategory?.color]);
  const categoryGroups = useMemo(() => buildExpenseCategoryGroups(analyticsCategories, (category) => getCategoryName(category, t)), [analyticsCategories, t]);
  const requestedDisplayCurrency = currencyMode === "native" ? baseCurrency : currencyMode;
  const displayCurrency = requestedDisplayCurrency;
  const expenseView = useMemo(() => {
    void ratesVersion;
    return buildExpenseView({ expenses: expenseState.expenses, expenseItems: expenseState.expenseItems, categories: analyticsCategories, filters, displayCurrency });
  }, [analyticsCategories, displayCurrency, expenseState.expenseItems, expenseState.expenses, filters, ratesVersion]);
  const categoryNames = useMemo(() => new Map(categoryGroups.map((group) => [group.key, group.name])), [categoryGroups]);
  const otherKey = categoryGroupKey("Other");
  const breakdown = expenseView.byCategory.reduce<Array<(typeof expenseView.byCategory)[number]>>((items, item) => {
    const key = item.key === UNALLOCATED_CATEGORY_KEY ? otherKey : item.key;
    const existing = items.find((candidate) => candidate.key === key);
    if (existing) { existing.value += item.value; return items; }
    items.push({ ...item, key, color: key === otherKey ? otherCategory?.color ?? "#8c8c8c" : item.color, name: categoryNames.get(key) ?? (key === otherKey ? t("category.other") : item.name) });
    return items;
  }, []).sort((left, right) => Math.abs(right.value) - Math.abs(left.value));
  const breakdownTotal = breakdown.reduce((sum, item) => sum + Math.abs(item.value), 0);
  const trackingStartedAt = useMemo(
    () => getExpenseTrackingStart(expenseState.expenses),
    [expenseState.expenses],
  );
  const average = calculateAverageDailyExpense(
    expenseView.history,
    filters,
    expenseView.total,
    dayjs(),
    trackingStartedAt,
  );
  const totalLabel = formatMoney(expenseView.total, displayCurrency);
  const averageLabel = formatMoney(average, displayCurrency);
  const trend = useMemo(() => buildExpenseTrendBuckets(expenseView.history, filters), [expenseView.history, filters]);
  const selectedCategory = categoryGroups.find((group) => {
    const keys = group.key === otherKey ? [otherKey, UNALLOCATED_CATEGORY_KEY] : [group.key];
    return keys.every((key) => filters.categoryKeys.includes(key));
  })?.key ?? "";
  const visibleHistory = showAllHistory ? expenseView.history : expenseView.history.slice(0, HISTORY_LIMIT);
  const hiddenHistoryCount = Math.max(0, expenseView.history.length - HISTORY_LIMIT);

  function closeForm() { setFormMode(null); setDraft(null); setEditing(null); setParseError(null); setParsing(false); }
  function openManual() { setEditing(null); setFormMode("manual"); setParseError(null); setDraft(createEmptyExpenseDraft(baseCurrency, primaryCategories[0]?.id)); }
  function openText() { setEditing(null); setFormMode("text"); setParseError(null); setDraft(null); }

  async function handleReceipt(file: File) {
    setEditing(null); setFormMode("receipt"); setDraft(null); setParseError(null); setParsing(true);
    try {
      const parsed = await parseReceiptInput({ fileName: file.name, fileType: "image/jpeg", fileDataUrl: await prepareReceiptImage(file), currency: baseCurrency, categories: primaryCategories });
      setDraft({ amount: parsed.total, currency: parsed.currency, categoryId: parsed.items[0]?.categoryId ?? primaryCategories[0]?.id, description: parsed.description, occurredAt: dayjs(), source: "receipt_ai", items: parsed.items, receiptReview: parsed.receiptReview });
    } catch (error) {
      setParseError(t(receiptErrorKey(error)));
      setDraft({ ...createEmptyExpenseDraft(baseCurrency, primaryCategories[0]?.id), description: file.name, source: "receipt_ai" });
    } finally { setParsing(false); if (receiptInput.current) receiptInput.current.value = ""; }
  }

  async function handleText(text: string) {
    setParsing(true); setParseError(null);
    const input = { text, currency: baseCurrency, categories: primaryCategories };
    try {
      const parsed = await parseTextInput(input).catch(() => parseTextInputLocally(input));
      const expense = parsed as ParsedExpense;
      const categoryId = expense.items[0]?.categoryId ?? primaryCategories[0]?.id;
      const description = expense.description || text;
      setDraft({ amount: expense.total, currency: expense.currency, categoryId, description, occurredAt: dayjs(), source: "text_ai", items: expense.items, receiptReview: expense.receiptReview });
    } catch {
      setParseError(t("expense.parserSuggestionOnly"));
      setDraft({ ...createEmptyExpenseDraft(detectCurrencyInText(text) ?? baseCurrency, primaryCategories[0]?.id), amount: detectAmountInText(text) ?? undefined, description: text, source: "text_ai" });
    } finally { setParsing(false); }
  }

  function openEdit(expense: Expense) {
    const items = expenseState.expenseItems.filter((item) => item.expenseId === expense.id).map(({ id, name, amount, quantity, unitPrice, categoryId, confidence }) => ({ id, name, amount, quantity, unitPrice, categoryId, confidence }));
    setEditing(expense); setSelected(null); setFormMode("edit"); setParseError(null);
    setDraft({ amount: expense.amount, currency: expense.currency, categoryId: expense.categoryId, description: expense.description, occurredAt: dayjs(expense.occurredAt), source: expense.source, items });
  }

  async function saveExpense(values: ExpenseFormValues) {
    if (formCategories.length === 0) { message.error(t("expense.contextUnavailable")); return; }
    const input = expenseFormToInput(values);
    if (!isValidMoneyDecimal(input.amount, input.currency) || input.amount <= 0) { message.error(t("feedback.invalidMoneyAmount")); return; }
    setSaving(true);
    try {
      if (editing) { await expenseState.updateExpense(editing.id, input); message.success(t("expense.updated")); }
      else { await expenseState.addExpense(input); message.success(t("expense.saved")); }
      closeForm();
    } catch { message.error(t("feedback.saveFailed")); }
    finally { setSaving(false); }
  }

  async function deleteExpense(expense: Expense) {
    try { await expenseState.deleteExpense(expense.id); setSelected(null); message.success(t("expense.deleted")); }
    catch { message.error(t("feedback.saveFailed")); }
  }

  function chooseCategory(key: string) {
    setFilters((current) => ({ ...current, categoryKeys: key === otherKey ? [otherKey, UNALLOCATED_CATEGORY_KEY] : key ? [key] : [] }));
  }

  const home = (
    <>
      <section className="summary-header">
        <div className="summary-copy"><span>{t("expense.spent")}</span><strong>{totalLabel}</strong><small><span>{t("expense.count", { count: expenseView.history.length })}</span><b aria-hidden="true">·</b><span>{t("expense.averageDailyExpense")} {averageLabel}</span></small></div>
        <div className="quick-actions">
          <button className="primary" type="button" onClick={() => receiptInput.current?.click()}><Camera size={17} />{t("inputMode.receipt")}</button>
          <button type="button" onClick={openText}><FileText size={17} />{t("inputMode.text")}</button>
          <button type="button" onClick={openManual}><PenLine size={17} />{t("inputMode.manual")}</button>
        </div>
      </section>

      <section className="filters" aria-label={t("expense.period")}>
        <div className="button-filter period-filter">{PERIODS.map((period) => <button className={filters.period === period ? "active" : ""} aria-pressed={filters.period === period} key={period} type="button" onClick={() => setFilters((current) => ({ ...current, period, customRange: period === "custom" && !current.customRange ? [dayjs().startOf("month").toISOString(), dayjs().endOf("day").toISOString()] : current.customRange }))}>{t(`expense.period.${period}`)}</button>)}</div>
        <div className={`button-filter category-filter${showAllCategories ? " expanded" : ""}`}>
          <button className={selectedCategory === "" ? "active" : ""} type="button" onClick={() => chooseCategory("")}>{t("expense.allCategories")}</button>
          {categoryGroups.map((group, index) => <button className={`${selectedCategory === group.key ? "active" : ""}${index >= MOBILE_CATEGORY_LIMIT ? " category-extra" : ""}`} key={group.key} type="button" onClick={() => chooseCategory(group.key)}><i style={{ background: group.color }} />{group.name}</button>)}
          {categoryGroups.length > MOBILE_CATEGORY_LIMIT ? <button className="category-toggle" type="button" aria-expanded={showAllCategories} onClick={() => setShowAllCategories((value) => !value)}>{showAllCategories ? t("actions.collapse") : t("actions.more", { count: categoryGroups.length - MOBILE_CATEGORY_LIMIT })}</button> : null}
        </div>
        {filters.period === "custom" ? <RangePicker className="date-range" allowClear={false} value={filters.customRange ? [dayjs(filters.customRange[0]), dayjs(filters.customRange[1])] : undefined} onChange={(range) => { if (range?.[0] && range[1]) setFilters((current) => ({ ...current, customRange: [range[0]!.toISOString(), range[1]!.toISOString()] })); }} /> : null}
      </section>

      {expenseView.history.length > 0 ? (
        <div className="analytics-grid">
          <section className="panel chart-panel"><h2>{t("expense.trend")}</h2><SpendingChart buckets={trend} currency={displayCurrency} locale={locale} label={t("expense.trend")} /></section>
          <section className="panel category-panel"><h2>{t("section.expensesByCategory")}</h2>{breakdown.map((item) => { const share = breakdownTotal > 0 ? Math.round(Math.abs(item.value) / breakdownTotal * 100) : 0; return <button type="button" key={item.key} onClick={() => chooseCategory(item.key)}><i style={{ background: item.color }} /><span>{item.name}</span><strong>{formatMoney(item.value, displayCurrency)}</strong><small>{share}%</small></button>; })}</section>
        </div>
      ) : null}

      <section className="history-section">
        <div className="section-heading"><h2>{t("expense.history")}</h2><span>{expenseView.history.length}</span></div>
        <ExpenseRows entries={visibleHistory} displayCurrency={currencyMode === "native" ? "native" : displayCurrency} onSelect={setSelected} />
        {hiddenHistoryCount > 0 ? <button className="history-toggle" type="button" aria-expanded={showAllHistory} onClick={() => setShowAllHistory((value) => !value)}>{showAllHistory ? t("actions.collapse") : t("actions.showMore", { count: hiddenHistoryCount })}</button> : null}
      </section>
    </>
  );

  return (
    <div className="app-shell">
      <input ref={receiptInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleReceipt(file); }} />
      <header className="app-header"><div className="brand"><span>F</span>Finanko</div><div className="header-actions"><button className="currency-button" type="button" title={t("currency.switch", { current: currentCurrencyLabel, next: nextCurrencyLabel })} onClick={() => setCurrencyMode(nextCurrency)}>{currencyMode === "native" ? <NativeCurrencyIcon size={15} /> : <CurrencyIcon currency={currencyMode} size={15} />}{currentCurrencyLabel}</button><button type="button" onClick={() => setLocale(locale === "ru" ? "en" : "ru")}>{locale.toUpperCase()}</button><button type="button" aria-label={t("actions.signOut")} onClick={() => void signOut()}><LogOut size={17} /></button></div></header>
      <main className="main-content">
        {formMode ? <ExpenseFormPage mode={formMode} draft={draft} categories={formCategories} parsing={parsing} saving={saving} parseError={parseError} onBack={closeForm} onParseText={handleText} onSave={saveExpense} /> : selected ? <ExpenseDetailsPage expense={selected} items={expenseState.expenseItems.filter((item) => item.expenseId === selected.id)} categories={analyticsCategories} onBack={() => setSelected(null)} onEdit={() => openEdit(selected)} onDelete={() => void deleteExpense(selected)} /> : home}
      </main>
    </div>
  );
}
