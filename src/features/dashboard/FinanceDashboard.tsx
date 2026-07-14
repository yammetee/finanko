import AntApp from "antd/es/app";
import Button from "antd/es/button";
import Card from "antd/es/card";
import Drawer from "antd/es/drawer";
import Empty from "antd/es/empty";
import Form from "antd/es/form";
import Layout from "antd/es/layout";
import Menu from "antd/es/menu";
import Modal from "antd/es/modal";
import Segmented from "antd/es/segmented";
import Select from "antd/es/select";
import Space from "antd/es/space";
import Tooltip from "antd/es/tooltip";
import Typography from "antd/es/typography";
import {
  LogOut,
  Menu as MenuIcon,
  Plus,
  Pencil,
  RotateCcw,
  Sparkles,
  Tags,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import dayjs from "dayjs";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useFinanceStore } from "../finance/financeStore";
import {
  buildAnalytics,
  filterVisibleTransactions,
} from "../finance/selectors";
import { CURRENCIES, TIMEFRAME_OPTIONS } from "../../shared/constants/finance";
import { MetricCard } from "./components/MetricCard";
import { AccountsPanel } from "./components/AccountsPanel";
import { DashboardCharts } from "./components/DashboardCharts";
import { useAuthStore } from "../auth/authStore";
import type { AccountFormValues } from "../accounts/AccountForm";
import type { CategoryFormValues } from "../categories/CategoryForm";
import type { PortfolioFormValues } from "../portfolios/PortfolioForm";
import type { TransactionFormValues } from "../transactions/TransactionForm";
import { parseReceiptInput, parseTextInput } from "../receipts/aiParser";
import {
  buildAssistantSummary,
  type AssistantActionType,
} from "../assistant/assistantSummary";
import { AssistantInsightStrip } from "../assistant/AssistantInsightStrip";
import type {
  Account,
  Timeframe,
  Transaction,
} from "../../shared/types/finance";
import type { TransactionFilter } from "../finance/financeTypes";
import type { CurrencyDisplayMode } from "../finance/financeTypes";
import { confirmDanger } from "../../shared/ui/confirmations";
import { CurrencyIcon, NativeCurrencyIcon } from "../../shared/ui/CurrencyIcon";
import {
  getAccountName,
  getPortfolioName,
  getTransactionDescription,
} from "../../shared/i18n/displayText";
import { useI18n } from "../../shared/i18n/i18nContext";
import { isLiabilityAccount } from "../../shared/lib/accounts";
import { refreshLiveExchangeRates } from "../../shared/lib/exchangeRates";
import { parseTextInputLocally, type ReceiptReview } from "../receipts/expenseParser";
import { validateItemsMatchTotal } from "../ledger/validation";
import { isValidMoneyDecimal } from "../ledger/money";

const { Content, Sider } = Layout;
const { Text } = Typography;

const AccountForm = lazy(() =>
  import("../accounts/AccountForm").then((module) => ({ default: module.AccountForm })),
);
const AssistantDialog = lazy(() =>
  import("../assistant/AssistantDialog").then((module) => ({ default: module.AssistantDialog })),
);
const CategoryForm = lazy(() =>
  import("../categories/CategoryForm").then((module) => ({ default: module.CategoryForm })),
);
const DeletePortfolioModal = lazy(() =>
  import("../portfolios/DeletePortfolioModal").then((module) => ({
    default: module.DeletePortfolioModal,
  })),
);
const PortfolioForm = lazy(() =>
  import("../portfolios/PortfolioForm").then((module) => ({ default: module.PortfolioForm })),
);
const TransactionForm = lazy(() =>
  import("../transactions/TransactionForm").then((module) => ({ default: module.TransactionForm })),
);
const TransactionHistory = lazy(() =>
  import("../transactions/TransactionHistory").then((module) => ({
    default: module.TransactionHistory,
  })),
);

function roundTransactionItemAmount(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeTransactionItems(
  items: TransactionFormValues["items"],
  fallbackCategoryId: string,
) {
  return items?.map((item) => {
    const quantity =
      typeof item.quantity === "number" && Number.isFinite(item.quantity)
        ? item.quantity
        : undefined;
    const unitPrice =
      typeof item.unitPrice === "number" && Number.isFinite(item.unitPrice)
        ? item.unitPrice
        : undefined;
    const amount =
      quantity !== undefined && unitPrice !== undefined
        ? roundTransactionItemAmount(quantity * unitPrice)
        : item.amount;

    return {
      ...item,
      amount,
      categoryId: item.categoryId || fallbackCategoryId,
    };
  });
}

export function FinanceDashboard() {
  const { modal, message } = AntApp.useApp();
  const { locale, setLocale, t } = useI18n();
  const [accountDrawer, setAccountDrawer] = useState(false);
  const [categoryDrawer, setCategoryDrawer] = useState(false);
  const [transactionDrawer, setTransactionDrawer] = useState(false);
  const [portfolioModal, setPortfolioModal] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState(false);
  const [deletePortfolioModal, setDeletePortfolioModal] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [inputMode, setInputMode] = useState("text");
  const [receiptReview, setReceiptReview] = useState<ReceiptReview | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [ratesVersion, setRatesVersion] = useState(0);
  const [accountForm] = Form.useForm();
  const [categoryForm] = Form.useForm();
  const [transactionForm] = Form.useForm();
  const [portfolioForm] = Form.useForm();
  const [textParserForm] = Form.useForm();

  const state = useFinanceStore();
  const { signOut } = useAuthStore();
  const generateDueRecurring = useFinanceStore((store) => store.generateDueRecurring);

  useEffect(() => {
    void generateDueRecurring().catch(() => message.error(t("feedback.saveFailed")));
  }, [generateDueRecurring, message, t]);

  useEffect(() => {
    let active = true;
    void refreshLiveExchangeRates().then((updated) => {
      if (active && updated) setRatesVersion((version) => version + 1);
    });
    return () => {
      active = false;
    };
  }, []);

  const activePortfolio = useMemo(() => state.portfolios.find(
    (portfolio) => portfolio.id === state.activePortfolioId && !portfolio.deletedAt,
  ), [state.activePortfolioId, state.portfolios]);
  const activePortfolioId = activePortfolio?.id ?? "";
  const portfolios = useMemo(() => state.portfolios.filter((portfolio) => !portfolio.deletedAt), [state.portfolios]);
  const portfolioAccounts = useMemo(() => state.accounts.filter(
    (account) => account.portfolioId === activePortfolioId && !account.deletedAt,
  ), [activePortfolioId, state.accounts]);
  const accounts = useMemo(() => portfolioAccounts.filter((account) => !account.isArchived), [portfolioAccounts]);
  const categories = useMemo(() => state.categories.filter(
    (category) => category.portfolioId === activePortfolioId,
  ), [activePortfolioId, state.categories]);
  const visibleTransactions = useMemo(() => filterVisibleTransactions(
    state.transactions,
    activePortfolioId,
  ), [activePortfolioId, state.transactions]);
  const dashboardTransactions = useMemo(() => visibleTransactions.filter((transaction) => {
    if (state.transactionFilter === "all") return true;
    return transaction.type === state.transactionFilter;
  }), [state.transactionFilter, visibleTransactions]);
  const displayCurrency = state.currencyDisplay ?? "native";
  const analyticsCurrency =
    displayCurrency === "native"
      ? activePortfolio?.baseCurrency ?? "USD"
      : displayCurrency;
  const currencyModes: CurrencyDisplayMode[] = ["native", ...CURRENCIES];
  const currentCurrencyIndex = currencyModes.indexOf(displayCurrency);
  const nextCurrencyMode = currencyModes[(currentCurrencyIndex + 1) % currencyModes.length];
  const currentCurrencyLabel = displayCurrency === "native" ? t("currency.native") : displayCurrency;
  const nextCurrencyLabel = nextCurrencyMode === "native" ? t("currency.native") : nextCurrencyMode;

  function cycleDisplayCurrency() {
    state.setCurrencyDisplay(nextCurrencyMode);
  }

  const analytics = useMemo(
    () => {
      void ratesVersion;
      return buildAnalytics(
        portfolioAccounts,
        categories,
        dashboardTransactions,
        state.timeframe,
        analyticsCurrency,
        state.transactionItems,
      );
    },
    [portfolioAccounts, analyticsCurrency, categories, dashboardTransactions, state.timeframe, state.transactionItems, ratesVersion],
  );
  const assistantSummary = useMemo(
    () => {
      void ratesVersion;
      return buildAssistantSummary(
        portfolioAccounts,
        categories,
        visibleTransactions,
        state.timeframe,
        activePortfolio?.baseCurrency ?? "USD",
        state.transactionItems,
      );
    },
    [
      portfolioAccounts,
      categories,
      visibleTransactions,
      state.timeframe,
      state.transactionItems,
      activePortfolio?.baseCurrency,
      ratesVersion,
    ],
  );

  async function addAccount(values: AccountFormValues) {
    if (!isValidMoneyDecimal(values.initialBalance, values.currency)) {
      message.error(t("feedback.invalidMoneyAmount"));
      return;
    }

    if (editingAccount) {
      await state.updateAccount(editingAccount.id, values);
      message.success(t("feedback.accountUpdated"));
    } else {
      await state.addAccount(values);
      message.success(t("feedback.accountAdded"));
    }
    accountForm.resetFields();
    setEditingAccount(null);
    setAccountDrawer(false);
  }

  async function addCategory(values: CategoryFormValues) {
    await state.addCategory(values);
    categoryForm.resetFields();
    setCategoryDrawer(false);
    message.success(t("feedback.categoryAdded"));
  }

  async function addTransaction(values: TransactionFormValues) {
    if (!isValidMoneyDecimal(values.amount, values.currency)) {
      message.error(t("feedback.invalidMoneyAmount"));
      return;
    }
    if (
      values.principalAmount !== undefined &&
      !isValidMoneyDecimal(values.principalAmount, values.currency)
    ) {
      message.error(t("feedback.invalidMoneyAmount"));
      return;
    }
    if (
      values.interestAmount !== undefined &&
      !isValidMoneyDecimal(values.interestAmount, values.currency)
    ) {
      message.error(t("feedback.invalidMoneyAmount"));
      return;
    }

    const normalizedItems = normalizeTransactionItems(values.items, values.categoryId ?? "");

    try {
      validateItemsMatchTotal({
        items: normalizedItems ?? [],
        total: values.amount,
        currency: values.currency,
      });
    } catch {
      message.error(t("feedback.transactionItemsMismatch"));
      return;
    }
    if (
      values.type === "debt_payment" &&
      Math.round(values.amount * 100) !==
        Math.round(((values.principalAmount ?? 0) + (values.interestAmount ?? 0)) * 100)
    ) {
      message.error(t("feedback.debtPaymentMismatch"));
      return;
    }
    if (values.type === "debt_payment") {
      const debtAccount = accounts.find((account) => account.id === values.linkedAccountId);
      if (!debtAccount || !isLiabilityAccount(debtAccount)) {
        message.error(t("feedback.debtPaymentRequiresDebtAccount"));
        return;
      }
    }

    const input = {
      accountId: values.accountId,
      type: values.type,
      amount: values.amount,
      currency: values.currency,
      categoryId: values.categoryId ?? "",
      linkedAccountId: values.linkedAccountId,
      principalAmount: values.principalAmount,
      interestAmount: values.interestAmount,
      description: values.description ?? "",
      occurredAt: values.occurredAt.toISOString(),
      source: values.source,
      items: normalizedItems,
      recurring:
        values.type === "income" || values.type === "expense"
          ? values.recurring
          : false,
      recurringMonths: values.recurringMonths,
    };
    if (editingTransaction) {
      await state.updateTransaction(editingTransaction.id, input);
      message.success(t("feedback.transactionUpdated"));
    } else {
      await state.addTransaction(input);
      message.success(t("feedback.transactionSaved"));
    }
    transactionForm.resetFields();
    setReceiptReview(null);
    setEditingTransaction(null);
    setTransactionDrawer(false);
  }

  function openNewAccountDrawer() {
    setEditingAccount(null);
    accountForm.resetFields();
    accountForm.setFieldsValue({
      currency: activePortfolio?.baseCurrency ?? "USD",
    });
    setAccountDrawer(true);
  }

  function openEditAccountDrawer(account: Account) {
    setEditingAccount(account);
    accountForm.setFieldsValue({
      ...account,
      initialBalance: isLiabilityAccount(account)
        ? Math.abs(account.initialBalance)
        : account.initialBalance,
      interestAllocationAccountId:
        account.interestAllocationAccountId ?? "__same_account__",
    });
    setAccountDrawer(true);
  }

  function closeAccountDrawer() {
    setAccountDrawer(false);
    setEditingAccount(null);
    accountForm.resetFields();
  }

  function openNewTransactionDrawer() {
    setEditingTransaction(null);
    transactionForm.resetFields();
    setReceiptReview(null);
    setInputMode("text");
    setTransactionDrawer(true);
  }

  function handleAssistantAction(action: AssistantActionType) {
    setAssistantOpen(false);
    if (action === "add_transaction") {
      openNewTransactionDrawer();
      return;
    }
    if (action === "review_transactions") {
      requestAnimationFrame(() => document.getElementById("history-section")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  function openEditTransactionDrawer(transaction: Transaction) {
    const items = (state.transactionItems ?? [])
      .filter((item) => item.transactionId === transaction.id)
      .map(({ name, amount, quantity, unitPrice, categoryId, confidence }) => ({
        name,
        amount,
        quantity,
        unitPrice,
        categoryId,
        confidence,
      }));
    setEditingTransaction(transaction);
    setReceiptReview(null);
    setInputMode("manual");
    const recurringRule = transaction.recurringRuleId
      ? state.recurringRules.find((rule) => rule.id === transaction.recurringRuleId)
      : undefined;
    const recurringMonths =
      recurringRule?.endsAt
        ? dayjs(recurringRule.endsAt)
            .startOf("month")
            .diff(dayjs(recurringRule.startsAt).startOf("month"), "month") + 1
        : 12;
    transactionForm.setFieldsValue({
      accountId: transaction.accountId,
      type: transaction.type,
      amount: transaction.amount,
      currency: transaction.currency,
      categoryId: transaction.categoryId,
      linkedAccountId: transaction.linkedAccountId,
      principalAmount: transaction.principalAmount,
      interestAmount: transaction.interestAmount,
      description: transaction.description,
      occurredAt: dayjs(transaction.occurredAt),
      source: transaction.source,
      items,
      recurring: transaction.source === "recurring",
      recurringMonths,
    });
    setTransactionDrawer(true);
  }

  function closeTransactionDrawer() {
    setTransactionDrawer(false);
    setEditingTransaction(null);
    transactionForm.resetFields();
    textParserForm.resetFields();
    setReceiptReview(null);
  }

  function confirmResetData() {
    confirmDanger({
      modal,
      title: t("confirm.resetData.title"),
      content: t("confirm.resetData.content"),
      okText: t("actions.resetData"),
      onConfirm: async () => {
        try { await state.resetFinanceData(); message.success(t("feedback.dataReset")); }
        catch { message.error(t("feedback.saveFailed")); }
      },
    });
  }

  function confirmDeleteTransaction(transaction: Transaction) {
    confirmDanger({
      modal,
      title: t("confirm.deleteTransaction.title"),
      content: t("confirm.deleteTransaction.content", {
        description:
          getTransactionDescription(transaction, t) ||
          t("confirm.deleteTransaction.fallback"),
      }),
      okText: t("actions.delete"),
      onConfirm: async () => {
        try { await state.deleteTransaction(transaction.id); message.success(t("feedback.transactionDeleted")); }
        catch { message.error(t("feedback.saveFailed")); }
      },
    });
  }

  function confirmArchiveAccount(account: Account) {
    confirmDanger({
      modal,
      title: t("confirm.archiveAccount.title"),
      content: t("confirm.archiveAccount.content", {
        name: getAccountName(account, t),
      }),
      okText: t("actions.archive"),
      onConfirm: async () => { try { await state.archiveAccount(account.id); } catch { message.error(t("feedback.saveFailed")); } },
    });
  }

  function openMobileEditAccountDrawer(account: Account) {
    setMobileMenuOpen(false);
    openEditAccountDrawer(account);
  }

  function confirmMobileArchiveAccount(account: Account) {
    setMobileMenuOpen(false);
    confirmArchiveAccount(account);
  }

  async function addPortfolio(values: PortfolioFormValues) {
    if (editingPortfolio && activePortfolio) await state.renamePortfolio(activePortfolio.id, values.name);
    else await state.addPortfolio(values.name, values.baseCurrency);
    portfolioForm.resetFields();
    setEditingPortfolio(false);
    setPortfolioModal(false);
    message.success(t(editingPortfolio ? "feedback.portfolioRenamed" : "feedback.portfolioCreated"));
  }

  function openRenamePortfolio() {
    if (!activePortfolio) return;
    setEditingPortfolio(true);
    portfolioForm.setFieldsValue({ name: activePortfolio.name, baseCurrency: activePortfolio.baseCurrency });
    setPortfolioModal(true);
  }

  function handleMobileMenuAction(key: string) {
    setMobileMenuOpen(false);
    if (key === "portfolio") setPortfolioModal(true);
    if (key === "rename-portfolio") openRenamePortfolio();
    if (key === "delete-portfolio") setDeletePortfolioModal(true);
    if (key === "account") openNewAccountDrawer();
    if (key === "category") setCategoryDrawer(true);
    if (key === "assistant") setAssistantOpen(true);
    if (key === "reset") confirmResetData();
    if (key === "sign-out") void signOut();
  }

  function handleInputModeChange(mode: string) {
    setReceiptReview(null);
    setInputMode(mode);
  }

  function fillParsedTransaction(values: TransactionFormValues, review?: ReceiptReview) {
    transactionForm.resetFields();
    transactionForm.setFieldsValue(values);
    setReceiptReview(review ?? null);
    setInputMode("manual");
  }

  async function parseTextTransaction(values: { text: string; accountId: string }) {
    const parserInput = {
      text: values.text,
      currency: activePortfolio?.baseCurrency ?? "USD",
      categories,
    };
    const parsed = await parseTextInput(parserInput).catch(() => parseTextInputLocally(parserInput));

    if (parsed.kind === "account") {
      transactionForm.resetFields();
      textParserForm.resetFields();
      setTransactionDrawer(false);
      setEditingAccount(null);
      accountForm.setFieldsValue({
        name: parsed.name,
        type: parsed.type,
        currency: parsed.currency,
        initialBalance: parsed.initialBalance,
        annualInterestRate: parsed.annualInterestRate,
        interestFrequency: parsed.interestFrequency,
        interestStartedAt: dayjs().startOf("day").toISOString(),
        loanTermMonths: parsed.loanTermMonths,
      });
      setAccountDrawer(true);
      message.success(t("feedback.parserPreparedAccount"));
      return;
    }

    const accountId = values.accountId;
    if (!accountId) {
      message.warning(t("feedback.createAccountFirst"));
      return;
    }

    fillParsedTransaction({
      accountId,
      type: parsed.type ?? "expense",
      amount: parsed.total,
      currency: parsed.currency,
      categoryId: parsed.items[0]?.categoryId,
      description: parsed.description,
      occurredAt: dayjs(),
      source: "text_ai",
      items: parsed.items,
    });
    message.success(t("feedback.parserPrepared"));
  }

  async function parseReceiptTransaction(values: {
    accountId: string;
    fileName: string;
    fileType?: string;
    fileDataUrl?: string;
  }) {
    const accountId = values.accountId;
    if (!accountId) {
      message.warning(t("feedback.createAccountFirst"));
      return false;
    }
    const parserInput = {
      fileName: values.fileName,
      fileType: values.fileType,
      fileDataUrl: values.fileDataUrl,
      currency: accounts.find((account) => account.id === accountId)?.currency ?? activePortfolio?.baseCurrency ?? "USD",
      categories,
    };
    const parsed = await parseReceiptInput(parserInput);
    fillParsedTransaction({
      accountId,
      type: parsed.type ?? "expense",
      amount: parsed.total,
      currency: parsed.currency,
      categoryId: parsed.items[0]?.categoryId,
      description: parsed.description,
      occurredAt: dayjs(),
      source: "receipt_ai",
      items: parsed.items,
    }, parsed.receiptReview);
    message.success(t(parsed.receiptReview?.requiresReview ? "feedback.receiptPreparedForReview" : "feedback.parserPrepared"));
    return true;
  }

  const dashboardBody = activePortfolio ? (
    <main className="dashboard-grid" id="dashboard-section">
      <DashboardCharts
        trend={analytics.trend}
        netWorthTrend={analytics.netWorthTrend}
        byCategory={analytics.byCategory}
        timeframe={state.timeframe}
        currency={analyticsCurrency}
      />

      <Card className="span-7" title={t("section.history")} id="history-section">
        <Suspense fallback={<div className="panel-loading" />}>
          <TransactionHistory
            transactions={dashboardTransactions}
            displayCurrency={displayCurrency}
            onEdit={openEditTransactionDrawer}
            onDelete={confirmDeleteTransaction}
          />
        </Suspense>
      </Card>
    </main>
  ) : (
    <section className="empty-portfolio-state">
      <Empty description={t("empty.noPortfolios")} image={Empty.PRESENTED_IMAGE_SIMPLE}>
        <Space>
          <Button type="primary" icon={<Plus size={16} />} onClick={() => setPortfolioModal(true)}>
            {t("actions.createPortfolio")}
          </Button>
          <Button onClick={confirmResetData}>{t("actions.resetData")}</Button>
        </Space>
      </Empty>
    </section>
  );

  return (
    <>
      <Layout className="app-shell">
        <Sider width={368} className="app-sider">
          <div className="brand">
            <span className="brand-mark">F</span>
            <span className="brand-name">Finanko</span>
          </div>
          <Space className="sidebar-actions" direction="vertical" size={8}>
            <div className="portfolio-switcher">
              <Select
                value={activePortfolio?.id}
                placeholder={t("empty.noPortfolios")}
                options={portfolios.map((portfolio) => ({ value: portfolio.id, label: getPortfolioName(portfolio, t) }))}
                onChange={state.setActivePortfolio}
              />
              <Button id='rename' aria-label={t("actions.renamePortfolio")} disabled={!activePortfolio} icon={<Pencil size={15} />} onClick={openRenamePortfolio} />
            </div>
            <Button
              type="primary"
              block
              icon={<Plus size={16} />}
              disabled={!activePortfolio}
              onClick={openNewTransactionDrawer}
            >
              {t("actions.transaction")}
            </Button>
            <Button type="text" block icon={<Plus size={16} />} onClick={() => setPortfolioModal(true)}>
              {t("actions.createPortfolio")}
            </Button>
            <Button type="text" block icon={<Wallet size={16} />} onClick={openNewAccountDrawer}>
              {t("actions.account")}
            </Button>
            <Button
              type="text"
              block
              icon={<Tags size={16} />}
              disabled={!activePortfolio}
              onClick={() => setCategoryDrawer(true)}
            >
              {t("actions.category")}
            </Button>
            <Button type="text" block icon={<Sparkles size={16} />} onClick={() => setAssistantOpen(true)}>
              {t("actions.assistant")}
            </Button>
          </Space>
          <AccountsPanel
            accounts={accounts}
            transactions={visibleTransactions}
            displayCurrency={displayCurrency}
            className="sidebar-accounts"
            onEditAccount={openEditAccountDrawer}
            onArchiveAccount={confirmArchiveAccount}
          />
          <div className="sider-user">
            <Segmented
              className="sidebar-language-switcher"
              block
              size="small"
              value={locale}
              options={[
                { label: "EN", value: "en" },
                { label: "RU", value: "ru" },
              ]}
              onChange={(value) => setLocale(value as "en" | "ru")}
            />
            <div className="sider-tools">
              <Button block type="text" onClick={confirmResetData}>
                {t("actions.resetData")}
              </Button>
              <Button
                block
                danger
                type="text"
                disabled={!activePortfolio}
                onClick={() => setDeletePortfolioModal(true)}
              >
                {t("actions.deletePortfolio")}
              </Button>
            </div>
            <Button block type="text" icon={<LogOut size={16} />} onClick={signOut}>
              {t("actions.signOut")}
            </Button>
            <div className="legal-links"><a href="/privacy.html" target="_blank">{t("legal.privacy")}</a><a href="/terms.html" target="_blank">{t("legal.terms")}</a></div>
          </div>
        </Sider>
        <Content className="shell-content">
          <header className="toolbar">
            <div className="toolbar-filters">
              <div className="toolbar-primary">
                <Segmented
                  block
                  className="timeframe-filter"
                  value={state.timeframe}
                  options={TIMEFRAME_OPTIONS.map((option) => ({ ...option, label: t(option.label) }))}
                  onChange={(value) => state.setTimeframe(value as Timeframe)}
                />
                <Button
                  className="mobile-menu-button"
                  aria-label="Menu"
                  icon={<MenuIcon size={18} />}
                  onClick={() => setMobileMenuOpen(true)}
                />
              </div>
              <div className="toolbar-secondary">
                <Segmented
                  block
                  className="transaction-type-filter"
                  value={state.transactionFilter}
                  options={[
                    { label: t("filter.all"), value: "all" },
                    { label: t("filter.income"), value: "income" },
                    { label: t("filter.expense"), value: "expense" },
                  ]}
                  onChange={(value) => state.setTransactionFilter(value as TransactionFilter)}
                />
                <Tooltip title={t("currency.switch", { current: currentCurrencyLabel, next: nextCurrencyLabel })}>
                  <Button
                    className="currency-cycle-button"
                    type="text"
                    aria-label={t("currency.switch", { current: currentCurrencyLabel, next: nextCurrencyLabel })}
                    icon={displayCurrency === "native" ? <NativeCurrencyIcon size={18} /> : <CurrencyIcon currency={displayCurrency} size={18} />}
                    onClick={cycleDisplayCurrency}
                  />
                </Tooltip>
              </div>
              <Button
                className="mobile-transaction-button"
                type="primary"
                icon={<Plus size={16} />}
                disabled={!activePortfolio}
                onClick={openNewTransactionDrawer}
              >
                {t("actions.transaction")}
              </Button>
            </div>
            <div className="toolbar-metrics">
              <MetricCard
                title={t("metric.netWorth")}
                value={analytics.netWorth}
                currency={analyticsCurrency}
                positive={analytics.netWorth >= 0}
                negative={analytics.netWorth < 0}
              />
              <MetricCard
                title={t("metric.income")}
                value={analytics.income}
                currency={analyticsCurrency}
                positive
              />
              <MetricCard
                title={t("metric.expenses")}
                value={analytics.expenses}
                currency={analyticsCurrency}
                negative
              />
            </div>
          </header>

          {activePortfolio && assistantSummary.spendingOpportunities[0] ? (
            <AssistantInsightStrip
              opportunity={assistantSummary.spendingOpportunities[0]}
              portfolioId={activePortfolio.id}
              onOpen={() => setAssistantOpen(true)}
            />
          ) : null}

          {dashboardBody}
        </Content>
      </Layout>

      <Drawer
        title={t(editingAccount ? "drawer.editAccount" : "drawer.newAccount")}
        open={accountDrawer}
        onClose={closeAccountDrawer}
        width={420}
      >
        {accountDrawer ? (
          <Suspense fallback={<div className="panel-loading" />}>
            <AccountForm
              form={accountForm}
              accounts={accounts}
              editingAccountId={editingAccount?.id}
              defaultCurrency={activePortfolio?.baseCurrency ?? "USD"}
              onFinish={addAccount}
            />
          </Suspense>
        ) : null}
      </Drawer>

      <Drawer
        title={t("drawer.newCategory")}
        open={categoryDrawer}
        onClose={() => {
          setCategoryDrawer(false);
          categoryForm.resetFields();
        }}
        width={380}
      >
        {categoryDrawer ? (
          <Suspense fallback={<div className="panel-loading" />}>
            <CategoryForm form={categoryForm} onFinish={addCategory} />
          </Suspense>
        ) : null}
      </Drawer>

      <Drawer
        title="Finanko"
        className="mobile-menu-drawer"
        closable={false}
        extra={
          <Button
            aria-label="Close menu"
            icon={<X size={20} />}
            type="text"
            onClick={() => setMobileMenuOpen(false)}
          />
        }
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        placement="right"
        width="min(340px, 88vw)"
      >
        <div className="mobile-menu-content">
          <div className="mobile-menu-field">
            <Text className="muted">{t("section.activePortfolio")}</Text>
            <Select
              value={activePortfolio?.id}
              placeholder={t("empty.noPortfolios")}
              className="mobile-menu-select"
              options={portfolios.map((portfolio) => ({
                value: portfolio.id,
                label: getPortfolioName(portfolio, t),
              }))}
              onChange={state.setActivePortfolio}
            />
          </div>
          <Segmented
            block
            size="small"
            value={locale}
            options={[
              { label: "EN", value: "en" },
              { label: "RU", value: "ru" },
            ]}
            onChange={(value) => setLocale(value as "en" | "ru")}
          />
          <AccountsPanel
            accounts={accounts}
            transactions={visibleTransactions}
            displayCurrency={displayCurrency}
            className="mobile-menu-accounts"
            onEditAccount={openMobileEditAccountDrawer}
            onArchiveAccount={confirmMobileArchiveAccount}
          />
          <Menu
            className="mobile-menu-navigation"
            mode="inline"
            selectable={false}
            onClick={({ key }) => handleMobileMenuAction(key)}
            items={[
              { key: "workspace", type: "group", label: t("menu.manage"), children: [
                { key: "portfolio", icon: <Plus size={17} />, label: t("actions.createPortfolio") },
                { key: "rename-portfolio", icon: <Pencil size={17} />, label: t("actions.renamePortfolio"), disabled: !activePortfolio },
                { key: "account", icon: <Wallet size={17} />, label: t("actions.account") },
                { key: "category", icon: <Tags size={17} />, label: t("actions.category"), disabled: !activePortfolio },
                { key: "assistant", icon: <Sparkles size={17} />, label: t("actions.assistant") },
              ] },
              { type: "divider" },
              { key: "settings", type: "group", label: t("menu.account"), children: [
                { key: "reset", icon: <RotateCcw size={17} />, label: t("actions.resetData") },
                { key: "delete-portfolio", danger: true, icon: <Trash2 size={17} />, label: t("actions.deletePortfolio"), disabled: !activePortfolio },
                { key: "sign-out", icon: <LogOut size={17} />, label: t("actions.signOut") },
              ] },
            ]}
          />
          <div className="legal-links"><a href="/privacy.html" target="_blank">{t("legal.privacy")}</a><a href="/terms.html" target="_blank">{t("legal.terms")}</a></div>
        </div>
      </Drawer>

      <Drawer
        title={t(editingTransaction ? "drawer.editTransaction" : "drawer.newTransaction")}
        open={transactionDrawer}
        onClose={closeTransactionDrawer}
        width={500}
      >
        {transactionDrawer ? (
          <Suspense fallback={<div className="panel-loading" />}>
            <TransactionForm
              form={transactionForm}
              textParserForm={textParserForm}
              mode={inputMode}
              baseCurrency={activePortfolio?.baseCurrency ?? "USD"}
              accounts={accounts}
              categories={categories}
              receiptReview={receiptReview}
              onModeChange={handleInputModeChange}
              onFinish={addTransaction}
              onParseText={parseTextTransaction}
              onParseReceipt={parseReceiptTransaction}
            />
          </Suspense>
        ) : null}
      </Drawer>

      <Modal
        title={t(editingPortfolio ? "modal.renamePortfolio" : "modal.newPortfolio")}
        open={portfolioModal}
        onCancel={() => { setPortfolioModal(false); setEditingPortfolio(false); portfolioForm.resetFields(); }}
        footer={null}
      >
        {portfolioModal ? (
          <Suspense fallback={<div className="panel-loading" />}>
            <PortfolioForm form={portfolioForm} onFinish={addPortfolio} editing={editingPortfolio} />
          </Suspense>
        ) : null}
      </Modal>

      {deletePortfolioModal ? (
        <Suspense fallback={null}>
          <DeletePortfolioModal
            open={deletePortfolioModal}
            portfolio={activePortfolio}
            onCancel={() => setDeletePortfolioModal(false)}
            onConfirm={async (portfolioId) => {
              try { await state.deletePortfolio(portfolioId); setDeletePortfolioModal(false); }
              catch { message.error(t("feedback.saveFailed")); }
            }}
          />
        </Suspense>
      ) : null}

      {assistantOpen ? (
        <Suspense fallback={null}>
          <AssistantDialog
            open={assistantOpen}
            summary={assistantSummary}
            onClose={() => setAssistantOpen(false)}
            onAction={handleAssistantAction}
          />
        </Suspense>
      ) : null}
    </>
  );
}
