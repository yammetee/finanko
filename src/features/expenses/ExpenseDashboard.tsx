import AntApp from "antd/es/app";
import Button from "antd/es/button";
import Card from "antd/es/card";
import DatePicker from "antd/es/date-picker";
import Tooltip from "antd/es/tooltip";
import Typography from "antd/es/typography";
import {
  Camera,
  FileText,
  LogOut,
  PenLine,
} from "lucide-react";
import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "../auth/authStore";
import { useFinanceStore } from "../finance/financeStore";
import {
  isDefaultExpenseCategory,
  sortDefaultExpenseCategories,
} from "../finance/seedData";
import {
  detectAmountInText,
  detectCurrencyInText,
  parseTextInputLocally,
  type ParsedExpense,
} from "../receipts/expenseParser";
import { parseReceiptInput, parseTextInput } from "../receipts/aiParser";
import { prepareReceiptImage } from "../receipts/receiptImage";
import { getCategoryName } from "../../shared/i18n/displayText";
import { useI18n } from "../../shared/i18n/i18nContext";
import { CURRENCIES } from "../../shared/constants/finance";
import { refreshLiveExchangeRates } from "../../shared/lib/exchangeRates";
import { formatMoney } from "../../shared/lib/format";
import { isValidMoneyDecimal } from "../../shared/lib/money";
import { confirmDanger } from "../../shared/ui/confirmations";
import { CurrencyIcon, NativeCurrencyIcon } from "../../shared/ui/CurrencyIcon";
import type { Currency, Transaction } from "../../shared/types/finance";
import {
  ExpenseComposer,
  type ExpenseInputMode,
} from "./ExpenseComposer";
import {
  createEmptyExpenseDraft,
  expenseFormToInput,
  type ExpenseDraft,
  type ExpenseFormValues,
} from "./expenseDraft";
import { ExpenseHistory } from "./ExpenseHistory";
import { ExpenseDetail } from "./ExpenseDetail";
import { ExpenseTrendChart } from "./ExpenseTrendChart";
import {
  buildExpenseCategoryGroups,
  buildExpenseTrendBuckets,
  buildExpenseView,
  categoryGroupKey,
  UNALLOCATED_CATEGORY_KEY,
  type ExpenseFilters,
  type ExpensePeriod,
} from "./expenseAnalytics";

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

const PERIODS: ExpensePeriod[] = ["today", "week", "month", "year", "all", "custom"];
const MONEY_SYMBOLS = ["$", "€", "₾", "₽", "฿", "¥", "£", "₿", "₩", "¢", "₹", "₺", "$", "₾", "€", "₽"];
type CurrencyDisplayMode = Currency | "native";

function MoneyBackdrop() {
  return (
    <div className="money-backdrop" aria-hidden="true">
      {MONEY_SYMBOLS.map((symbol, index) => <span key={`${symbol}-${index}`}>{symbol}</span>)}
    </div>
  );
}

function receiptErrorKey(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "file_too_large" || code === "compressed_file_too_large") return "receipt.fileTooLarge" as const;
  if (code === "unsupported_file" || code === "unsupported_image") return "receipt.unsupported" as const;
  if (code === "receipt_incomplete") return "receipt.incomplete" as const;
  return "receipt.parseError" as const;
}

export function ExpenseDashboard() {
  const { message, modal } = AntApp.useApp();
  const { locale, setLocale, t } = useI18n();
  const signOut = useAuthStore((state) => state.signOut);
  const state = useFinanceStore();
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<ExpenseInputMode>("manual");
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [editingExpense, setEditingExpense] = useState<Transaction | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Transaction | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [ratesVersion, setRatesVersion] = useState(0);
  const [currencyDisplay, setCurrencyDisplay] = useState<CurrencyDisplayMode>("native");
  const [filters, setFilters] = useState<ExpenseFilters>({
    period: "month",
    categoryKeys: [],
  });

  useEffect(() => {
    let active = true;
    void refreshLiveExchangeRates().then((updated) => {
      if (active && updated) setRatesVersion((value) => value + 1);
    });
    return () => {
      active = false;
    };
  }, []);

  const activePortfolios = useMemo(
    () => state.portfolios.filter((portfolio) => !portfolio.deletedAt),
    [state.portfolios],
  );
  const primaryPortfolio = activePortfolios.find(
    (portfolio) => portfolio.id === state.activePortfolioId,
  ) ?? activePortfolios[0];
  const primaryAccount = state.accounts.find(
    (account) => account.portfolioId === primaryPortfolio?.id && !account.deletedAt,
  );
  const activePortfolioIds = useMemo(
    () => activePortfolios.map((portfolio) => portfolio.id),
    [activePortfolios],
  );
  const expenseCategories = useMemo(
    () => state.categories.filter(
      (category) => category.type === "expense" && activePortfolioIds.includes(category.portfolioId),
    ),
    [activePortfolioIds, state.categories],
  );
  const primaryCategories = useMemo(
    () => sortDefaultExpenseCategories(expenseCategories.filter(
      (category) =>
        category.portfolioId === primaryPortfolio?.id && isDefaultExpenseCategory(category),
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
  const currencyModes: CurrencyDisplayMode[] = ["native", ...CURRENCIES];
  const currentCurrencyIndex = currencyModes.indexOf(currencyDisplay);
  const nextCurrencyMode = currencyModes[(currentCurrencyIndex + 1) % currencyModes.length];
  const currentCurrencyLabel = currencyDisplay === "native" ? t("currency.native") : currencyDisplay;
  const nextCurrencyLabel = nextCurrencyMode === "native" ? t("currency.native") : nextCurrencyMode;
  const otherCategory = primaryCategories.find(
    (category) => category.name.trim().toLocaleLowerCase() === "other",
  );
  const analyticsCategories = useMemo(
    () => expenseCategories.map((category) => isDefaultExpenseCategory(category)
      ? category
      : {
          ...category,
          name: "Other",
          color: otherCategory?.color ?? "#7f93a6",
        }),
    [expenseCategories, otherCategory?.color],
  );
  const categoryGroups = useMemo(
    () => buildExpenseCategoryGroups(analyticsCategories, (category) => getCategoryName(category, t)),
    [analyticsCategories, t],
  );
  const expenseView = useMemo(() => {
    void ratesVersion;
    return buildExpenseView({
      transactions: state.transactions,
      transactionItems: state.transactionItems,
      categories: analyticsCategories,
      portfolioIds: activePortfolioIds,
      filters,
      displayCurrency,
    });
  }, [
    activePortfolioIds,
    displayCurrency,
    analyticsCategories,
    filters,
    ratesVersion,
    state.transactionItems,
    state.transactions,
  ]);
  const categoryNameByKey = useMemo(
    () => new Map(categoryGroups.map((group) => [group.key, group.name])),
    [categoryGroups],
  );
  const otherCategoryKey = categoryGroupKey("Other");
  const localizedCategoryBreakdown = expenseView.byCategory.reduce<
    Array<(typeof expenseView.byCategory)[number]>
  >((items, item) => {
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
  const trendBuckets = useMemo(
    () => buildExpenseTrendBuckets(expenseView.history, filters),
    [expenseView.history, filters],
  );
  const averageExpense = expenseView.history.length > 0
    ? expenseView.total / expenseView.history.length
    : 0;
  const categoryMagnitude = localizedCategoryBreakdown.reduce(
    (sum, category) => sum + Math.abs(category.value),
    0,
  );

  function cycleDisplayCurrency() {
    setCurrencyDisplay(nextCurrencyMode);
  }

  function closeComposer() {
    setComposerOpen(false);
    setDraft(null);
    setEditingExpense(null);
    setParseError(null);
    setParsing(false);
  }

  function openManual() {
    setEditingExpense(null);
    setComposerMode("manual");
    setParseError(null);
    setDraft(createEmptyExpenseDraft(baseCurrency, primaryCategories[0]?.id));
    setComposerOpen(true);
  }

  function openText() {
    setEditingExpense(null);
    setComposerMode("text");
    setParseError(null);
    setDraft(null);
    setComposerOpen(true);
  }

  function chooseReceipt() {
    receiptInputRef.current?.click();
  }

  async function handleReceipt(file: File) {
    setEditingExpense(null);
    setComposerMode("receipt");
    setDraft(null);
    setParseError(null);
    setParsing(true);
    setComposerOpen(true);

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
      if (receiptInputRef.current) receiptInputRef.current.value = "";
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
          ...createEmptyExpenseDraft(
            detectCurrencyInText(text) ?? baseCurrency,
            primaryCategories[0]?.id,
          ),
          amount: detectAmountInText(text) ?? undefined,
          description: text,
          source: "text_ai",
        });
      }
    } catch {
      setParseError(t("expense.parserSuggestionOnly"));
      setDraft({
        ...createEmptyExpenseDraft(
          detectCurrencyInText(text) ?? baseCurrency,
          primaryCategories[0]?.id,
        ),
        amount: detectAmountInText(text) ?? undefined,
        description: text,
        source: "text_ai",
      });
    } finally {
      setParsing(false);
    }
  }

  function openEdit(transaction: Transaction) {
    const items = state.transactionItems
      .filter((item) => item.transactionId === transaction.id)
      .map(({ id, name, amount, quantity, unitPrice, categoryId, confidence }) => ({
        id,
        name,
        amount,
        quantity,
        unitPrice,
        categoryId,
        confidence,
      }));
    setEditingExpense(transaction);
    setSelectedExpense(null);
    setComposerMode("edit");
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
    setComposerOpen(true);
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
        await state.updateTransaction(editingExpense.id, input);
        message.success(t("expense.updated"));
      } else {
        await state.addTransaction(input);
        message.success(t("expense.saved"));
      }
      closeComposer();
    } catch {
      message.error(t("feedback.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  function deleteExpense(transaction: Transaction) {
    confirmDanger({
      modal,
      title: t("expense.deleteTitle"),
      content: t("expense.deleteDescription", {
        name: transaction.description || t("expense.untitled"),
      }),
      okText: t("actions.delete"),
      onConfirm: async () => {
        try {
          await state.deleteTransaction(transaction.id);
          setSelectedExpense(null);
          message.success(t("expense.deleted"));
        } catch {
          message.error(t("feedback.saveFailed"));
        }
      },
    });
  }

  function categoryFilterKeys(key: string) {
    return key === otherCategoryKey ? [otherCategoryKey, UNALLOCATED_CATEGORY_KEY] : [key];
  }

  function isCategorySelected(key: string) {
    return categoryFilterKeys(key).every((candidate) => filters.categoryKeys.includes(candidate));
  }

  function toggleCategory(key: string) {
    const keys = categoryFilterKeys(key);
    setFilters((current) => ({
      ...current,
      categoryKeys: keys.every((candidate) => current.categoryKeys.includes(candidate))
        ? current.categoryKeys.filter((candidate) => !keys.includes(candidate))
        : [...new Set([...current.categoryKeys, ...keys])],
    }));
  }

  return (
    <div className="expense-app-shell">
      <MoneyBackdrop />
      <input
        ref={receiptInputRef}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        capture="environment"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleReceipt(file);
        }}
      />

      <header className="expense-app-header">
        <div className="expense-brand">
          <span className="brand-mark">F</span>
          <span>Finanko</span>
        </div>
        <div className="expense-header-actions">
          <Tooltip title={t("currency.switch", { current: currentCurrencyLabel, next: nextCurrencyLabel })}>
            <Button
              aria-label={t("currency.switch", { current: currentCurrencyLabel, next: nextCurrencyLabel })}
              icon={currencyDisplay === "native"
                ? <NativeCurrencyIcon size={18} />
                : <CurrencyIcon currency={currencyDisplay} size={18} />}
              type="text"
              onClick={cycleDisplayCurrency}
            />
          </Tooltip>
          <Button
            aria-label={t("expense.switchLanguage")}
            className="expense-language-button"
            type="text"
            onClick={() => setLocale(locale === "ru" ? "en" : "ru")}
          >
            {locale.toUpperCase()}
          </Button>
          <Button
            aria-label={t("actions.signOut")}
            icon={<LogOut size={18} />}
            type="text"
            onClick={() => void signOut()}
          />
        </div>
      </header>

      <main className="expense-app-main">
        <section className="expense-entry-section" aria-labelledby="expense-entry-title">
          <Text className="expense-eyebrow" id="expense-entry-title">
            {t("expense.howToAdd")}
          </Text>
          <div className="expense-entry-actions">
            <button className="expense-entry-action expense-entry-action-primary" type="button" onClick={chooseReceipt}>
              <Camera size={24} />
              <span>{t("inputMode.receipt")}</span>
            </button>
            <button className="expense-entry-action" type="button" onClick={openText}>
              <FileText size={24} />
              <span>{t("inputMode.text")}</span>
            </button>
            <button className="expense-entry-action" type="button" onClick={openManual}>
              <PenLine size={24} />
              <span>{t("inputMode.manual")}</span>
            </button>
          </div>
        </section>

        <Card className="expense-summary-card">
          <Text className="expense-eyebrow">{t("expense.spent")}</Text>
          <Title className="expense-total" level={1}>
            {formatMoney(expenseView.total, displayCurrency)}
          </Title>

          <div className="expense-filter-section">
            <Text className="expense-filter-label">{t("expense.period")}</Text>
            <div className="expense-filter-chips" role="group" aria-label={t("expense.period")}>
              {PERIODS.map((period) => (
                <button
                  aria-pressed={filters.period === period}
                  className={`expense-filter-chip${filters.period === period ? " is-active" : ""}`}
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

          {filters.period === "custom" ? (
            <RangePicker
              aria-label={t("expense.customRange")}
              className="expense-custom-range"
              allowClear={false}
              value={filters.customRange
                ? [dayjs(filters.customRange[0]), dayjs(filters.customRange[1])]
                : undefined}
              onChange={(range) => {
                const start = range?.[0];
                const end = range?.[1];
                if (!start || !end) return;
                setFilters((current) => ({
                  ...current,
                  customRange: [start.toISOString(), end.toISOString()],
                }));
              }}
            />
          ) : null}

          <div className="expense-filter-section">
            <Text className="expense-filter-label">{t("expense.categories")}</Text>
            <div className="expense-filter-chips" role="group" aria-label={t("expense.categories")}>
              <button
                aria-pressed={filters.categoryKeys.length === 0}
                className={`expense-filter-chip${filters.categoryKeys.length === 0 ? " is-active" : ""}`}
                type="button"
                onClick={() => setFilters((current) => ({ ...current, categoryKeys: [] }))}
              >
                {t("expense.allCategories")}
              </button>
              {categoryGroups.map((group) => (
                <button
                  aria-pressed={isCategorySelected(group.key)}
                  className={`expense-filter-chip${isCategorySelected(group.key) ? " is-active" : ""}`}
                  key={group.key}
                  type="button"
                  onClick={() => toggleCategory(group.key)}
                >
                  <span className="expense-category-dot" style={{ background: group.color }} />
                  {group.name}
                </button>
              ))}
            </div>
          </div>

          {filters.categoryKeys.length > 0 || filters.period !== "month" ? (
            <Button
              className="expense-reset-filters"
              type="link"
              onClick={() => setFilters({ period: "month", categoryKeys: [] })}
            >
              {t("expense.resetFilters")}
            </Button>
          ) : null}
        </Card>

        <div className="expense-insights-grid">
          <Card className="expense-panel" title={t("expense.trend")}>
            {expenseView.history.length > 0 ? (
              <>
                <div className="expense-insight-summary">
                  <span>{t("expense.transactionCount", { count: expenseView.history.length })}</span>
                  <span>{t("expense.averageExpense")}: <strong>{formatMoney(averageExpense, displayCurrency)}</strong></span>
                </div>
                <ExpenseTrendChart
                  buckets={trendBuckets}
                  currency={displayCurrency}
                  label={t("expense.trend")}
                  locale={locale}
                />
              </>
            ) : <Text className="muted">{t("empty.noExpenses")}</Text>}
          </Card>

          <Card className="expense-panel" title={t("section.expensesByCategory")}>
            {localizedCategoryBreakdown.length > 0 ? (
              <div className="expense-category-list">
                {localizedCategoryBreakdown.map((category) => {
                  const active = isCategorySelected(category.key);
                  const share = categoryMagnitude > 0
                    ? Math.round((Math.abs(category.value) / categoryMagnitude) * 100)
                    : 0;
                  return (
                    <button
                      aria-pressed={active}
                      className={`expense-category-row${active ? " is-active" : ""}`}
                      key={category.key}
                      type="button"
                      onClick={() => toggleCategory(category.key)}
                    >
                      <span className="expense-category-label">
                        <span className="expense-category-dot" style={{ background: category.color }} />
                        {category.name}
                      </span>
                      <span className="expense-category-value">
                        {formatMoney(category.value, displayCurrency)}
                      </span>
                      <span className="expense-category-track" aria-hidden="true">
                        <span style={{ background: category.color, width: `${Math.max(3, share)}%` }} />
                      </span>
                      <span className="expense-category-share">{share}%</span>
                    </button>
                  );
                })}
              </div>
            ) : <Text className="muted">{t("empty.noExpenses")}</Text>}
          </Card>
        </div>

        <Card className="expense-history-card" title={t("expense.history") }>
          <ExpenseHistory
            entries={expenseView.history}
            displayCurrency={displayCurrency}
            categoryFiltered={filters.categoryKeys.length > 0}
            onOpen={setSelectedExpense}
            onEdit={openEdit}
            onDelete={deleteExpense}
          />
        </Card>
      </main>

      <ExpenseComposer
        open={composerOpen}
        mode={composerMode}
        draft={draft}
        categories={editorCategories}
        parsing={parsing}
        saving={saving}
        parseError={parseError}
        onClose={closeComposer}
        onParseText={handleText}
        onSave={saveExpense}
      />

      <ExpenseDetail
        open={Boolean(selectedExpense)}
        transaction={selectedExpense}
        items={selectedExpense
          ? state.transactionItems.filter((item) => item.transactionId === selectedExpense.id)
          : []}
        categories={analyticsCategories}
        onClose={() => setSelectedExpense(null)}
        onEdit={openEdit}
        onDelete={deleteExpense}
      />

    </div>
  );
}
