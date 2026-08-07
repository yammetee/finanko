import AntApp from "antd/es/app";
import DatePicker from "antd/es/date-picker";
import dayjs from "dayjs";
import { Camera, FileText, LogOut, PenLine } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CURRENCIES } from "../../shared/constants/finance";
import { getCategoryName } from "../../shared/i18n/displayText";
import { useI18n } from "../../shared/i18n/i18nContext";
import { refreshLiveExchangeRates } from "../../shared/lib/exchangeRates";
import { formatMoney } from "../../shared/lib/format";
import { isValidMoneyDecimal } from "../../shared/lib/money";
import { CurrencyIcon, NativeCurrencyIcon } from "../../shared/ui/CurrencyIcon";
import type { Currency, Transaction } from "../../shared/types/finance";
import { useAuthStore } from "../auth/authStore";
import { useFinanceStore } from "../finance/financeStore";
import { isDefaultExpenseCategory, sortDefaultExpenseCategories } from "../finance/seedData";
import { parseReceiptInput, parseTextInput } from "../receipts/aiParser";
import {
  detectAmountInText,
  detectCurrencyInText,
  parseTextInputLocally,
  type ParsedExpense,
} from "../receipts/expenseParser";
import { prepareReceiptImage } from "../receipts/receiptImage";
import { ExpenseActivity } from "./ExpenseActivity";
import { ExpenseEditor, type ExpenseEditorMode } from "./ExpenseEditor";
import { ExpenseGraph } from "./ExpenseGraph";
import { ExpenseRecord } from "./ExpenseRecord";
import {
  buildExpenseCategoryGroups,
  buildExpenseTrendBuckets,
  buildExpenseView,
  calculateAverageDailyExpense,
  categoryGroupKey,
  UNALLOCATED_CATEGORY_KEY,
  type ExpenseFilters,
  type ExpensePeriod,
} from "./expenseAnalytics";
import {
  createEmptyExpenseDraft,
  expenseFormToInput,
  type ExpenseDraft,
  type ExpenseFormValues,
} from "./expenseDraft";

const { RangePicker } = DatePicker;
const PERIODS: ExpensePeriod[] = ["today", "week", "month", "year", "all", "custom"];
type CurrencyDisplay = Currency | "native";

function receiptErrorKey(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "file_too_large" || code === "compressed_file_too_large") return "receipt.fileTooLarge" as const;
  if (code === "unsupported_file" || code === "unsupported_image") return "receipt.unsupported" as const;
  if (code === "receipt_incomplete") return "receipt.incomplete" as const;
  return "receipt.parseError" as const;
}

export function ExpenseWorkspace() {
  const { message } = AntApp.useApp();
  const { locale, setLocale, t } = useI18n();
  const signOut = useAuthStore((state) => state.signOut);
  const finance = useFinanceStore();
  const receiptInput = useRef<HTMLInputElement>(null);
  const [editorMode, setEditorMode] = useState<ExpenseEditorMode | null>(null);
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [editingExpense, setEditingExpense] = useState<Transaction | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Transaction | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [ratesVersion, setRatesVersion] = useState(0);
  const [currencyDisplay, setCurrencyDisplay] = useState<CurrencyDisplay>("native");
  const [filters, setFilters] = useState<ExpenseFilters>({ period: "month", categoryKeys: [] });

  useEffect(() => {
    let active = true;
    void refreshLiveExchangeRates().then((updated) => {
      if (active && updated) setRatesVersion((value) => value + 1);
    });
    return () => { active = false; };
  }, []);

  const activePortfolios = useMemo(
    () => finance.portfolios.filter((portfolio) => !portfolio.deletedAt),
    [finance.portfolios],
  );
  const primaryPortfolio = activePortfolios.find(
    (portfolio) => portfolio.id === finance.activePortfolioId,
  ) ?? activePortfolios[0];
  const primaryAccount = finance.accounts.find(
    (account) => account.portfolioId === primaryPortfolio?.id && !account.deletedAt,
  );
  const activePortfolioIds = useMemo(
    () => activePortfolios.map((portfolio) => portfolio.id),
    [activePortfolios],
  );
  const expenseCategories = useMemo(
    () => finance.categories.filter(
      (category) => category.type === "expense" && activePortfolioIds.includes(category.portfolioId),
    ),
    [activePortfolioIds, finance.categories],
  );
  const primaryCategories = useMemo(
    () => sortDefaultExpenseCategories(expenseCategories.filter(
      (category) => category.portfolioId === primaryPortfolio?.id && isDefaultExpenseCategory(category),
    )),
    [expenseCategories, primaryPortfolio?.id],
  );
  const editorCategories = useMemo(
    () => editingExpense
      ? expenseCategories.filter((category) => category.portfolioId === editingExpense.portfolioId)
      : primaryCategories,
    [editingExpense, expenseCategories, primaryCategories],
  );
  const baseCurrency = primaryPortfolio?.baseCurrency ?? "USD";
  const displayCurrency = currencyDisplay === "native" ? baseCurrency : currencyDisplay;
  const currencyModes: CurrencyDisplay[] = ["native", ...CURRENCIES];
  const currentCurrencyIndex = currencyModes.indexOf(currencyDisplay);
  const nextCurrencyMode = currencyModes[(currentCurrencyIndex + 1) % currencyModes.length];
  const currentCurrencyLabel = currencyDisplay === "native" ? baseCurrency : currencyDisplay;
  const nextCurrencyLabel = nextCurrencyMode === "native" ? baseCurrency : nextCurrencyMode;
  const otherCategory = primaryCategories.find(
    (category) => category.name.trim().toLocaleLowerCase() === "other",
  );
  const analyticsCategories = useMemo(
    () => expenseCategories.map((category) => isDefaultExpenseCategory(category)
      ? category
      : { ...category, name: "Other", color: otherCategory?.color ?? "#7f93a6" }),
    [expenseCategories, otherCategory?.color],
  );
  const categoryGroups = useMemo(
    () => buildExpenseCategoryGroups(analyticsCategories, (category) => getCategoryName(category, t)),
    [analyticsCategories, t],
  );
  const expenseView = useMemo(() => {
    void ratesVersion;
    return buildExpenseView({
      transactions: finance.transactions,
      transactionItems: finance.transactionItems,
      categories: analyticsCategories,
      portfolioIds: activePortfolioIds,
      filters,
      displayCurrency,
    });
  }, [
    activePortfolioIds,
    analyticsCategories,
    displayCurrency,
    filters,
    finance.transactionItems,
    finance.transactions,
    ratesVersion,
  ]);
  const categoryNameByKey = useMemo(
    () => new Map(categoryGroups.map((group) => [group.key, group.name])),
    [categoryGroups],
  );
  const otherCategoryKey = categoryGroupKey("Other");
  const breakdown = expenseView.byCategory.reduce<Array<(typeof expenseView.byCategory)[number]>>((items, item) => {
    const key = item.key === UNALLOCATED_CATEGORY_KEY ? otherCategoryKey : item.key;
    const existing = items.find((candidate) => candidate.key === key);
    if (existing) {
      existing.value += item.value;
      return items;
    }
    items.push({
      ...item,
      key,
      color: key === otherCategoryKey ? otherCategory?.color ?? "#7f93a6" : item.color,
      name: categoryNameByKey.get(key) ?? (key === otherCategoryKey ? t("category.other") : item.name),
    });
    return items;
  }, []).sort((left, right) => Math.abs(right.value) - Math.abs(left.value));
  const categoryMagnitude = breakdown.reduce((sum, category) => sum + Math.abs(category.value), 0);
  const averageDailyExpense = calculateAverageDailyExpense(expenseView.history, filters, expenseView.total);
  const trendBuckets = useMemo(
    () => buildExpenseTrendBuckets(expenseView.history, filters),
    [expenseView.history, filters],
  );
  const selectedCategoryKey = categoryGroups.find((group) => {
    const keys = group.key === otherCategoryKey ? [otherCategoryKey, UNALLOCATED_CATEGORY_KEY] : [group.key];
    return keys.every((key) => filters.categoryKeys.includes(key));
  })?.key ?? "";

  function closeEditor() {
    setEditorMode(null);
    setDraft(null);
    setEditingExpense(null);
    setParseError(null);
    setParsing(false);
  }

  function openManual() {
    setEditingExpense(null);
    setEditorMode("manual");
    setDraft(createEmptyExpenseDraft(baseCurrency, primaryCategories[0]?.id));
    setParseError(null);
  }

  function openText() {
    setEditingExpense(null);
    setEditorMode("text");
    setDraft(null);
    setParseError(null);
  }

  async function handleReceipt(file: File) {
    setEditingExpense(null);
    setEditorMode("receipt");
    setDraft(null);
    setParseError(null);
    setParsing(true);
    try {
      const parsed = await parseReceiptInput({
        fileName: file.name,
        fileType: "image/jpeg",
        fileDataUrl: await prepareReceiptImage(file),
        currency: baseCurrency,
        categories: primaryCategories,
      });
      setDraft({
        amount: parsed.total,
        currency: parsed.currency,
        categoryId: parsed.items[0]?.categoryId ?? primaryCategories[0]?.id,
        description: parsed.description,
        occurredAt: dayjs(),
        source: "receipt_ai",
        items: parsed.items,
        receiptReview: parsed.receiptReview,
      });
    } catch (error) {
      setParseError(t(receiptErrorKey(error)));
      setDraft({
        ...createEmptyExpenseDraft(baseCurrency, primaryCategories[0]?.id),
        description: file.name,
        source: "receipt_ai",
      });
    } finally {
      setParsing(false);
      if (receiptInput.current) receiptInput.current.value = "";
    }
  }

  async function handleText(text: string) {
    setParsing(true);
    setParseError(null);
    const parserInput = { text, currency: baseCurrency, categories: primaryCategories };
    try {
      const parsed = await parseTextInput(parserInput).catch(() => parseTextInputLocally(parserInput));
      if (parsed.kind === "transaction") {
        const expense = parsed as ParsedExpense;
        setDraft({
          amount: expense.total,
          currency: expense.currency,
          categoryId: expense.items[0]?.categoryId ?? primaryCategories[0]?.id,
          description: expense.description || text,
          occurredAt: dayjs(),
          source: "text_ai",
          items: expense.items,
          receiptReview: expense.receiptReview,
        });
      } else {
        setParseError(t("expense.parserSuggestionOnly"));
        setDraft({
          ...createEmptyExpenseDraft(detectCurrencyInText(text) ?? baseCurrency, primaryCategories[0]?.id),
          amount: detectAmountInText(text) ?? undefined,
          description: text,
          source: "text_ai",
        });
      }
    } catch {
      setParseError(t("expense.parserSuggestionOnly"));
      setDraft({
        ...createEmptyExpenseDraft(detectCurrencyInText(text) ?? baseCurrency, primaryCategories[0]?.id),
        amount: detectAmountInText(text) ?? undefined,
        description: text,
        source: "text_ai",
      });
    } finally {
      setParsing(false);
    }
  }

  function openEdit(transaction: Transaction) {
    const items = finance.transactionItems
      .filter((item) => item.transactionId === transaction.id)
      .map(({ id, name, amount, quantity, unitPrice, categoryId, confidence }) => ({
        id, name, amount, quantity, unitPrice, categoryId, confidence,
      }));
    setEditingExpense(transaction);
    setSelectedExpense(null);
    setEditorMode("edit");
    setParseError(null);
    setDraft({
      amount: transaction.amount,
      currency: transaction.currency,
      categoryId: transaction.categoryId,
      description: transaction.description,
      occurredAt: dayjs(transaction.occurredAt),
      source: transaction.source,
      items,
    });
  }

  async function saveExpense(values: ExpenseFormValues) {
    if (!primaryPortfolio || !primaryAccount) {
      message.error(t("expense.contextUnavailable"));
      return;
    }
    if (!isValidMoneyDecimal(values.amount, values.currency) || values.amount <= 0) {
      message.error(t("feedback.invalidMoneyAmount"));
      return;
    }
    setSaving(true);
    try {
      const input = expenseFormToInput(values);
      if (editingExpense) {
        await finance.updateTransaction(editingExpense.id, input);
        message.success(t("expense.updated"));
      } else {
        await finance.addTransaction(input);
        message.success(t("expense.saved"));
      }
      closeEditor();
    } catch {
      message.error(t("feedback.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteExpense(transaction: Transaction) {
    try {
      await finance.deleteTransaction(transaction.id);
      setSelectedExpense(null);
      message.success(t("expense.deleted"));
    } catch {
      message.error(t("feedback.saveFailed"));
    }
  }

  function setCategoryFilter(key: string) {
    const categoryKeys = key === otherCategoryKey
      ? [otherCategoryKey, UNALLOCATED_CATEGORY_KEY]
      : key ? [key] : [];
    setFilters((current) => ({ ...current, categoryKeys }));
  }

  const home = (
    <>
      <section className="capture-zone" aria-label={t("expense.howToAdd")}>
        <button className="capture-receipt" type="button" onClick={() => receiptInput.current?.click()}>
          <Camera size={20} />
          <span>{t("inputMode.receipt")}</span>
        </button>
        <button type="button" onClick={openText}><FileText size={18} /><span>{t("inputMode.text")}</span></button>
        <button type="button" onClick={openManual}><PenLine size={18} /><span>{t("inputMode.manual")}</span></button>
      </section>

      <section className="spending-overview" aria-labelledby="spending-total-title">
        <div className="overview-filter">
          <span>{t("expense.period")}</span>
          <div className="filter-rail" role="group" aria-label={t("expense.period")}>
            {PERIODS.map((period) => (
              <button
                className={filters.period === period ? "is-active" : ""}
                aria-pressed={filters.period === period}
                key={period}
                type="button"
                onClick={() => setFilters((current) => ({
                  ...current,
                  period,
                  customRange: period === "custom" && !current.customRange
                    ? [dayjs().startOf("month").toISOString(), dayjs().endOf("day").toISOString()]
                    : current.customRange,
                }))}
              >
                {t(`expense.period.${period}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="overview-filter">
          <span>{t("expense.categories")}</span>
          <div className="filter-rail" role="group" aria-label={t("expense.categories")}>
            <button
              className={selectedCategoryKey === "" ? "is-active" : ""}
              aria-pressed={selectedCategoryKey === ""}
              type="button"
              onClick={() => setCategoryFilter("")}
            >
              {t("expense.allCategories")}
            </button>
            {categoryGroups.map((group) => (
              <button
                className={selectedCategoryKey === group.key ? "is-active" : ""}
                aria-pressed={selectedCategoryKey === group.key}
                key={group.key}
                type="button"
                onClick={() => setCategoryFilter(group.key)}
              >
                <i style={{ background: group.color }} />
                {group.name}
              </button>
            ))}
          </div>
        </div>

        {filters.period === "custom" ? (
          <RangePicker
            className="overview-range"
            allowClear={false}
            value={filters.customRange ? [dayjs(filters.customRange[0]), dayjs(filters.customRange[1])] : undefined}
            onChange={(range) => {
              if (!range?.[0] || !range[1]) return;
              setFilters((current) => ({
                ...current,
                customRange: [range[0]!.toISOString(), range[1]!.toISOString()],
              }));
            }}
          />
        ) : null}

        <div className="overview-total-row">
          <div>
            <span id="spending-total-title">{t("expense.spent")}</span>
            <strong>{formatMoney(expenseView.total, displayCurrency)}</strong>
          </div>
        </div>

        <div className="overview-meta">
          <span>{t("expense.transactionCount", { count: expenseView.history.length })}</span>
          <span>{t("expense.averageDailyExpense")} <strong>{formatMoney(averageDailyExpense, displayCurrency)}</strong></span>
        </div>

        {expenseView.history.length > 0 ? (
          <ExpenseGraph buckets={trendBuckets} currency={displayCurrency} locale={locale} label={t("expense.trend")} />
        ) : null}

        {breakdown.length > 0 ? (
          <div className="category-summary">
            <div className="category-bar" aria-hidden="true">
              {breakdown.map((category) => (
                <i key={category.key} style={{ background: category.color, flexGrow: Math.abs(category.value) }} />
              ))}
            </div>
            {breakdown.map((category) => {
              const share = categoryMagnitude > 0 ? Math.round(Math.abs(category.value) / categoryMagnitude * 100) : 0;
              return (
                <button type="button" key={category.key} onClick={() => setCategoryFilter(category.key)}>
                  <i style={{ background: category.color }} />
                  <span>{category.name}</span>
                  <strong>{formatMoney(category.value, displayCurrency)}</strong>
                  <small>{share}%</small>
                </button>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="activity-section" aria-labelledby="activity-title">
        <h2 id="activity-title">{t("expense.history")}</h2>
        <ExpenseActivity
          entries={expenseView.history}
          displayCurrency={displayCurrency}
          categoryFiltered={filters.categoryKeys.length > 0}
          onSelect={setSelectedExpense}
        />
      </section>
    </>
  );

  return (
    <div className="app-frame">
      <input
        ref={receiptInput}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        capture="environment"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleReceipt(file);
        }}
      />
      <header className="topbar">
        <div className="wordmark"><span>F</span>Finanko</div>
        <div>
          <button
            className="topbar-currency"
            type="button"
            title={t("currency.switch", { current: currentCurrencyLabel, next: nextCurrencyLabel })}
            aria-label={t("currency.switch", { current: currentCurrencyLabel, next: nextCurrencyLabel })}
            onClick={() => setCurrencyDisplay(nextCurrencyMode)}
          >
            {currencyDisplay === "native" ? <NativeCurrencyIcon size={15} /> : <CurrencyIcon currency={currencyDisplay} size={15} />}
            <span>{currentCurrencyLabel}</span>
          </button>
          <button type="button" onClick={() => setLocale(locale === "ru" ? "en" : "ru")}>{locale.toUpperCase()}</button>
          <button type="button" onClick={() => void signOut()} aria-label={t("actions.signOut")}><LogOut size={17} /></button>
        </div>
      </header>
      <main className="workspace">
        {editorMode ? (
          <ExpenseEditor
            mode={editorMode}
            draft={draft}
            categories={editorCategories}
            parsing={parsing}
            saving={saving}
            parseError={parseError}
            onBack={closeEditor}
            onParseText={handleText}
            onSave={saveExpense}
          />
        ) : selectedExpense ? (
          <ExpenseRecord
            transaction={selectedExpense}
            items={finance.transactionItems.filter((item) => item.transactionId === selectedExpense.id)}
            categories={analyticsCategories}
            onBack={() => setSelectedExpense(null)}
            onEdit={() => openEdit(selectedExpense)}
            onDelete={() => void deleteExpense(selectedExpense)}
          />
        ) : home}
      </main>
    </div>
  );
}
