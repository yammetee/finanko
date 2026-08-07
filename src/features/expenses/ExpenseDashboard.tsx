import AntApp from "antd/es/app";
import Button from "antd/es/button";
import Card from "antd/es/card";
import DatePicker from "antd/es/date-picker";
import Drawer from "antd/es/drawer";
import Form from "antd/es/form";
import Input from "antd/es/input";
import Segmented from "antd/es/segmented";
import Typography from "antd/es/typography";
import {
  Camera,
  FileText,
  LogOut,
  PenLine,
  Plus,
  Settings,
} from "lucide-react";
import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "../auth/authStore";
import { useFinanceStore } from "../finance/financeStore";
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
import {
  buildExpenseCategoryGroups,
  buildExpenseTrendBuckets,
  buildExpenseView,
  UNALLOCATED_CATEGORY_KEY,
  type ExpenseFilters,
  type ExpensePeriod,
} from "./expenseAnalytics";

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

const PERIODS: ExpensePeriod[] = ["today", "week", "month", "year", "all", "custom"];
const DEFAULT_CATEGORY_COLOR = "#7f93a6";
const CATEGORY_COLORS = ["#f4bd45", "#59a9f7", "#9b7bea", "#f07f8b", "#4ec7d8", "#c277d9", "#7f93a6", "#48c98a"];
const MONEY_SYMBOLS = ["$", "€", "₾", "₽", "฿", "¥", "£", "₿", "₩", "¢", "₹", "₺", "$", "₾", "€", "₽"];

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [categoryForm] = Form.useForm<{ name: string; color: string }>();
  const categoryColor = Form.useWatch("color", categoryForm) ?? DEFAULT_CATEGORY_COLOR;
  const [ratesVersion, setRatesVersion] = useState(0);
  const [selectedDisplayCurrency, setSelectedDisplayCurrency] = useState<Currency | null>(null);
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
    () => expenseCategories.filter((category) => category.portfolioId === primaryPortfolio?.id),
    [expenseCategories, primaryPortfolio?.id],
  );
  const editorCategories = useMemo(
    () => editingExpense
      ? expenseCategories.filter((category) => category.portfolioId === editingExpense.portfolioId)
      : primaryCategories,
    [editingExpense, expenseCategories, primaryCategories],
  );
  const baseCurrency = primaryPortfolio?.baseCurrency ?? "USD";
  const displayCurrency = selectedDisplayCurrency ?? baseCurrency;
  const categoryGroups = useMemo(
    () => buildExpenseCategoryGroups(expenseCategories, (category) => getCategoryName(category, t)),
    [expenseCategories, t],
  );
  const expenseView = useMemo(() => {
    void ratesVersion;
    return buildExpenseView({
      transactions: state.transactions,
      transactionItems: state.transactionItems,
      categories: expenseCategories,
      portfolioIds: activePortfolioIds,
      filters,
      displayCurrency,
    });
  }, [
    activePortfolioIds,
    displayCurrency,
    expenseCategories,
    filters,
    ratesVersion,
    state.transactionItems,
    state.transactions,
  ]);
  const categoryNameByKey = useMemo(
    () => new Map(categoryGroups.map((group) => [group.key, group.name])),
    [categoryGroups],
  );
  const localizedCategoryBreakdown = expenseView.byCategory.map((item) => ({
    ...item,
    name: item.key === UNALLOCATED_CATEGORY_KEY
      ? t("expense.unallocated")
      : categoryNameByKey.get(item.key) ?? item.name,
  }));
  const trendBuckets = useMemo(
    () => buildExpenseTrendBuckets(expenseView.history, filters),
    [expenseView.history, filters],
  );
  const maxTrend = Math.max(1, ...trendBuckets.map((point) => Math.abs(point.value)));
  const averageExpense = expenseView.history.length > 0
    ? expenseView.total / expenseView.history.length
    : 0;
  const categoryMagnitude = localizedCategoryBreakdown.reduce(
    (sum, category) => sum + Math.abs(category.value),
    0,
  );

  function trendLabel(start: string, end: string) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const durationHours = (endDate.getTime() - startDate.getTime()) / (60 * 60 * 1000);
    if (durationHours < 6 && startDate.toDateString() === endDate.toDateString()) {
      const hourFormatter = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return hourFormatter.format(startDate);
    }
    const formatter = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
      day: "numeric",
      month: "short",
    });
    const startLabel = formatter.format(startDate).replace(" г.", "");
    const endLabel = formatter.format(endDate).replace(" г.", "");
    return startDate.toDateString() === endDate.toDateString()
      ? startLabel
      : `${startLabel}–${endLabel}`;
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

  async function addCategory(values: { name: string; color: string }) {
    try {
      await state.addCategory({ name: values.name.trim(), color: values.color, type: "expense" });
      categoryForm.resetFields();
      categoryForm.setFieldValue("color", DEFAULT_CATEGORY_COLOR);
      message.success(t("feedback.categoryAdded"));
    } catch {
      message.error(t("feedback.saveFailed"));
    }
  }

  function toggleCategory(key: string) {
    setFilters((current) => ({
      ...current,
      categoryKeys: current.categoryKeys.includes(key)
        ? current.categoryKeys.filter((candidate) => candidate !== key)
        : [...current.categoryKeys, key],
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
        <Button
          aria-label={t("expense.settings")}
          icon={<Settings size={19} />}
          type="text"
          onClick={() => setSettingsOpen(true)}
        />
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
          <div className="expense-summary-heading">
            <div>
              <Text className="expense-eyebrow">{t("expense.spent")}</Text>
              <Title className="expense-total" level={1}>
                {formatMoney(expenseView.total, displayCurrency)}
              </Title>
            </div>
            <div
              className="expense-currency-switch"
              role="group"
              aria-label={t("expense.displayCurrency")}
            >
              {CURRENCIES.map((currency) => (
                <button
                  aria-pressed={displayCurrency === currency}
                  className={displayCurrency === currency ? "is-active" : ""}
                  key={currency}
                  type="button"
                  onClick={() => setSelectedDisplayCurrency(currency)}
                >
                  {currency}
                </button>
              ))}
            </div>
          </div>

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
                  aria-pressed={filters.categoryKeys.includes(group.key)}
                  className={`expense-filter-chip${filters.categoryKeys.includes(group.key) ? " is-active" : ""}`}
                  key={group.key}
                  type="button"
                  onClick={() => toggleCategory(group.key)}
                >
                  <span className="expense-category-dot" style={{ background: group.color }} />
                  {group.name}
                </button>
              ))}
              <button
                aria-pressed={filters.categoryKeys.includes(UNALLOCATED_CATEGORY_KEY)}
                className={`expense-filter-chip${filters.categoryKeys.includes(UNALLOCATED_CATEGORY_KEY) ? " is-active" : ""}`}
                type="button"
                onClick={() => toggleCategory(UNALLOCATED_CATEGORY_KEY)}
              >
                <span className="expense-category-dot expense-category-dot-muted" />
                {t("expense.unallocated")}
              </button>
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
                <div
                  className="expense-trend"
                  role="img"
                  aria-label={`${t("expense.trend")}: ${trendBuckets
                    .map((point) => `${trendLabel(point.start, point.end)} ${formatMoney(point.value, displayCurrency)}`)
                    .join(", ")}`}
                >
                  {trendBuckets.map((point) => (
                    <div
                      className="expense-trend-column"
                      key={point.key}
                      title={`${trendLabel(point.start, point.end)}: ${formatMoney(point.value, displayCurrency)}`}
                    >
                      <span className="expense-trend-value">
                        {point.value ? formatMoney(point.value, displayCurrency) : "—"}
                      </span>
                      <div
                        className={`expense-trend-bar${point.value === 0 ? " is-empty" : ""}${point.value < 0 ? " is-negative" : ""}`}
                        style={{ height: `${point.value === 0 ? 2 : Math.max(8, (Math.abs(point.value) / maxTrend) * 100)}%` }}
                      />
                      <span className="expense-trend-label">{trendLabel(point.start, point.end)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <Text className="muted">{t("empty.noExpenses")}</Text>}
          </Card>

          <Card className="expense-panel" title={t("section.expensesByCategory")}>
            {localizedCategoryBreakdown.length > 0 ? (
              <div className="expense-category-list">
                {localizedCategoryBreakdown.map((category) => {
                  const active = filters.categoryKeys.includes(category.key);
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
        categories={expenseCategories}
        onClose={() => setSelectedExpense(null)}
        onEdit={openEdit}
        onDelete={deleteExpense}
      />

      <Drawer
        className="expense-settings"
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title={t("expense.settings")}
        width={420}
      >
        <div className="expense-settings-content">
          <section className="expense-settings-section">
            <div className="expense-settings-section-heading">
              <Text className="expense-section-title">{t("expense.language")}</Text>
              <Text className="muted">{t("expense.languageHint")}</Text>
            </div>
            <Segmented
              block
              value={locale}
              options={[{ label: "RU", value: "ru" }, { label: "EN", value: "en" }]}
              onChange={(value) => setLocale(value as "ru" | "en")}
            />
          </section>
          <section className="expense-settings-section">
            <div className="expense-settings-section-heading">
              <Text className="expense-section-title">{t("expense.categories")}</Text>
              <Text className="muted">{t("expense.categoriesHint")}</Text>
            </div>
            <div className="expense-settings-categories">
              {primaryCategories.map((category) => (
                <div className="expense-settings-category" key={category.id}>
                  <span style={{ background: category.color }} />
                  {getCategoryName(category, t)}
                </div>
              ))}
            </div>
            <Form
              form={categoryForm}
              initialValues={{ color: DEFAULT_CATEGORY_COLOR }}
              layout="vertical"
              onFinish={addCategory}
              className="expense-category-form"
            >
              <Form.Item name="name" label={t("expense.newCategory")} rules={[{ required: true, whitespace: true }]}>
                <Input placeholder={t("expense.categoryPlaceholder")} />
              </Form.Item>
              <Form.Item name="color" hidden rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <div className="expense-color-field">
                <Text>{t("form.color")}</Text>
                <div className="expense-color-swatches" role="group" aria-label={t("form.color")}>
                  {CATEGORY_COLORS.map((color) => (
                    <button
                      aria-label={t("expense.chooseColor", { color })}
                      aria-pressed={categoryColor === color}
                      className={categoryColor === color ? "is-active" : ""}
                      key={color}
                      style={{ background: color }}
                      type="button"
                      onClick={() => categoryForm.setFieldValue("color", color)}
                    />
                  ))}
                </div>
              </div>
              <Button block htmlType="submit" icon={<Plus size={16} />} type="primary">
                {t("actions.category")}
              </Button>
            </Form>
          </section>
          <div className="expense-settings-footer">
            <Button block icon={<LogOut size={17} />} onClick={() => void signOut()}>
              {t("actions.signOut")}
            </Button>
            <div className="legal-links">
              <a href="/privacy.html" target="_blank">{t("legal.privacy")}</a>
              <a href="/terms.html" target="_blank">{t("legal.terms")}</a>
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
