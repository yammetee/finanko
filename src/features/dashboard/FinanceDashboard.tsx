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
import Typography from "antd/es/typography";
import Upload from "antd/es/upload";
import {
  Download,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  LayoutDashboard,
  Menu as MenuIcon,
  Plus,
  Sparkles,
  Tags,
  UploadCloud,
  Wallet,
} from "lucide-react";
import dayjs from "dayjs";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useFinanceStore } from "../finance/financeStore";
import {
  buildAnalytics,
  filterVisibleTransactions,
} from "../finance/selectors";
import { TIMEFRAME_OPTIONS } from "../../shared/constants/finance";
import { MetricCard } from "./components/MetricCard";
import { AccountsPanel } from "./components/AccountsPanel";
import { useAuthStore } from "../auth/authStore";
import type { AccountFormValues } from "../accounts/AccountForm";
import type { CategoryFormValues } from "../categories/CategoryForm";
import type { PortfolioFormValues } from "../portfolios/PortfolioForm";
import type { TransactionFormValues } from "../transactions/TransactionForm";
import { parseReceiptInput, parseTextInput } from "../receipts/aiParser";
import {
  buildAssistantSummary,
} from "../assistant/assistantSummary";
import type {
  Account,
  Timeframe,
  Transaction,
} from "../../shared/types/finance";
import type { TransactionFilter } from "../finance/financeTypes";
import type { FinanceSnapshot } from "../finance/financeTypes";
import { confirmDanger } from "../../shared/ui/confirmations";
import {
  getAccountName,
  getPortfolioName,
  getTransactionDescription,
} from "../../shared/i18n/displayText";
import { useI18n } from "../../shared/i18n/i18nContext";
import { useMediaQuery } from "../../shared/lib/useMediaQuery";
import { isLiabilityAccount } from "../../shared/lib/accounts";
import { refreshLiveExchangeRates } from "../../shared/lib/exchangeRates";

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
const DashboardCharts = lazy(() =>
  import("./components/DashboardCharts").then((module) => ({ default: module.DashboardCharts })),
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

export function FinanceDashboard() {
  const { modal, message } = AntApp.useApp();
  const { locale, setLocale, t } = useI18n();
  const [accountDrawer, setAccountDrawer] = useState(false);
  const [categoryDrawer, setCategoryDrawer] = useState(false);
  const [transactionDrawer, setTransactionDrawer] = useState(false);
  const [portfolioModal, setPortfolioModal] = useState(false);
  const [deletePortfolioModal, setDeletePortfolioModal] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [siderCollapsed, setSiderCollapsed] = useState(false);
  const [inputMode, setInputMode] = useState("manual");
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [ratesVersion, setRatesVersion] = useState(0);
  const [accountForm] = Form.useForm();
  const [categoryForm] = Form.useForm();
  const [transactionForm] = Form.useForm();
  const [portfolioForm] = Form.useForm();
  const [textParserForm] = Form.useForm();

  const state = useFinanceStore();
  const { signOut, user } = useAuthStore();
  const currentUser = user();
  const isMobile = useMediaQuery("(max-width: 1180px)");
  const generateDueRecurring = useFinanceStore((store) => store.generateDueRecurring);

  useEffect(() => {
    generateDueRecurring();
  }, [generateDueRecurring]);

  useEffect(() => {
    let active = true;
    void refreshLiveExchangeRates().then((updated) => {
      if (active && updated) setRatesVersion((version) => version + 1);
    });
    return () => {
      active = false;
    };
  }, []);

  const activePortfolio = state.portfolios.find(
    (portfolio) => portfolio.id === state.activePortfolioId && !portfolio.deletedAt,
  );
  const activePortfolioId = activePortfolio?.id ?? "";
  const portfolios = state.portfolios.filter((portfolio) => !portfolio.deletedAt);
  const accounts = state.accounts.filter(
    (account) => account.portfolioId === activePortfolioId && !account.deletedAt,
  );
  const categories = state.categories.filter(
    (category) => category.portfolioId === activePortfolioId,
  );
  const visibleTransactions = filterVisibleTransactions(
    state.transactions,
    activePortfolioId,
  );
  const dashboardTransactions = visibleTransactions.filter((transaction) => {
    if (state.transactionFilter === "all") return true;
    return transaction.type === state.transactionFilter;
  });

  const analytics = useMemo(
    () => {
      void ratesVersion;
      return buildAnalytics(
        accounts,
        categories,
        dashboardTransactions,
        state.timeframe,
        activePortfolio?.baseCurrency ?? "USD",
      );
    },
    [accounts, categories, dashboardTransactions, state.timeframe, activePortfolio?.baseCurrency, ratesVersion],
  );
  const assistantSummary = useMemo(
    () => {
      void ratesVersion;
      return assistantOpen
        ? buildAssistantSummary(
            accounts,
            categories,
            visibleTransactions,
            state.timeframe,
            activePortfolio?.baseCurrency ?? "USD",
          )
        : null;
    },
    [
      accounts,
      assistantOpen,
      categories,
      visibleTransactions,
      state.timeframe,
      activePortfolio?.baseCurrency,
      ratesVersion,
    ],
  );

  function addAccount(values: AccountFormValues) {
    if (editingAccount) {
      state.updateAccount(editingAccount.id, values);
      message.success(t("feedback.accountUpdated"));
    } else {
      state.addAccount(values);
      message.success(t("feedback.accountAdded"));
    }
    accountForm.resetFields();
    setEditingAccount(null);
    setAccountDrawer(false);
  }

  function addCategory(values: CategoryFormValues) {
    state.addCategory(values);
    categoryForm.resetFields();
    setCategoryDrawer(false);
    message.success(t("feedback.categoryAdded"));
  }

  function addTransaction(values: TransactionFormValues) {
    const input = {
      accountId: values.accountId,
      type: values.type,
      amount: values.amount,
      currency: values.currency,
      categoryId: values.categoryId,
      description: values.description ?? "",
      occurredAt: values.occurredAt.toISOString(),
      source: values.source,
      items: values.items,
      recurring: values.recurring,
      recurringMonths: values.recurringMonths,
    };
    if (editingTransaction) {
      state.updateTransaction(editingTransaction.id, input);
      message.success(t("feedback.transactionUpdated"));
    } else {
      state.addTransaction(input);
      message.success(t("feedback.transactionSaved"));
    }
    transactionForm.resetFields();
    setEditingTransaction(null);
    setTransactionDrawer(false);
  }

  function openNewAccountDrawer() {
    setEditingAccount(null);
    accountForm.resetFields();
    setAccountDrawer(true);
  }

  function openEditAccountDrawer(account: Account) {
    setEditingAccount(account);
    accountForm.setFieldsValue({
      ...account,
      initialBalance: isLiabilityAccount(account)
        ? Math.abs(account.initialBalance)
        : account.initialBalance,
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
    setInputMode("manual");
    setTransactionDrawer(true);
  }

  function openEditTransactionDrawer(transaction: Transaction) {
    const items = (state.transactionItems ?? [])
      .filter((item) => item.transactionId === transaction.id)
      .map(({ name, amount, categoryId, confidence }) => ({
        name,
        amount,
        categoryId,
        confidence,
      }));
    setEditingTransaction(transaction);
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
  }

  function confirmResetDemo() {
    confirmDanger({
      modal,
      title: t("confirm.resetDemo.title"),
      content: t("confirm.resetDemo.content"),
      okText: t("actions.resetDemo"),
      onConfirm: () => {
        state.resetDemoData();
        message.success(t("feedback.demoReset"));
      },
    });
  }

  function exportLocalBackup() {
    const snapshot = state.exportSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `finanko-backup-${dayjs().format("YYYY-MM-DD")}.json`;
    link.click();
    URL.revokeObjectURL(url);
    message.success(t("feedback.backupExported"));
  }

  function isFinanceSnapshot(value: unknown): value is FinanceSnapshot {
    if (!value || typeof value !== "object") return false;
    const snapshot = value as Partial<FinanceSnapshot>;
    return (
      typeof snapshot.activePortfolioId === "string" &&
      Array.isArray(snapshot.portfolios) &&
      Array.isArray(snapshot.accounts) &&
      Array.isArray(snapshot.categories) &&
      Array.isArray(snapshot.transactions)
    );
  }

  async function importLocalBackup(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!isFinanceSnapshot(parsed)) {
        message.error(t("feedback.backupInvalid"));
        return;
      }
      state.importSnapshot({
        ...parsed,
        transactionItems: parsed.transactionItems ?? [],
        recurringRules: parsed.recurringRules ?? [],
        transactionFilter: parsed.transactionFilter ?? "all",
        timeframe: parsed.timeframe ?? "month",
      });
      setMobileMenuOpen(false);
      message.success(t("feedback.backupImported"));
    } catch {
      message.error(t("feedback.backupInvalid"));
    }
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
      onConfirm: () => state.deleteTransaction(transaction.id),
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
      onConfirm: () => state.archiveAccount(account.id),
    });
  }

  function addPortfolio(values: PortfolioFormValues) {
    state.addPortfolio(values.name, values.baseCurrency);
    portfolioForm.resetFields();
    setPortfolioModal(false);
    message.success(t("feedback.portfolioCreated"));
  }

  async function mockTextParser(values: { text: string }) {
    const parsed = await parseTextInput({
      text: values.text,
      currency: activePortfolio?.baseCurrency ?? "USD",
      categories,
    });

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

    const accountId = accounts[0]?.id;
    if (!accountId) {
      message.warning(t("feedback.createAccountFirst"));
      return;
    }

    transactionForm.setFieldsValue({
      accountId,
      type: "expense",
      amount: parsed.total,
      currency: parsed.currency,
      categoryId: parsed.items[0]?.categoryId,
      description: parsed.description,
      occurredAt: dayjs(),
      source: "text_ai",
      items: parsed.items,
    });
    setInputMode("manual");
    message.success(t("feedback.parserPrepared"));
  }

  async function mockReceiptParser(values: { fileName: string }) {
    const accountId = accounts[0]?.id;
    if (!accountId) {
      message.warning(t("feedback.createAccountFirst"));
      return;
    }
    const parsed = await parseReceiptInput({
      fileName: values.fileName,
      currency: activePortfolio?.baseCurrency ?? "USD",
      categories,
    });
    transactionForm.setFieldsValue({
      accountId,
      type: "expense",
      amount: parsed.total,
      currency: parsed.currency,
      categoryId: parsed.items[0]?.categoryId,
      description: parsed.description,
      occurredAt: dayjs(),
      source: "receipt_ai",
      items: parsed.items,
    });
    setInputMode("manual");
    message.success(t("feedback.parserPrepared"));
  }

  const dashboardBody = activePortfolio ? (
    <main className="dashboard-grid" id="dashboard-section">
      {!isMobile ? (
        <section className="metrics-row">
          <MetricCard
            title={t("metric.netWorth")}
            value={analytics.netWorth}
            currency={activePortfolio.baseCurrency}
            positive={analytics.netWorth >= 0}
            negative={analytics.netWorth < 0}
          />
          <MetricCard
            title={t("metric.savings")}
            value={analytics.savingsTotal}
            currency={activePortfolio.baseCurrency}
          />
          <MetricCard
            title={t("metric.income")}
            value={analytics.income}
            currency={activePortfolio.baseCurrency}
            positive
          />
          <MetricCard
            title={t("metric.expenses")}
            value={analytics.expenses}
            currency={activePortfolio.baseCurrency}
            negative
          />
          <MetricCard
            title={t("metric.netFlow")}
            value={analytics.net}
            currency={activePortfolio.baseCurrency}
            positive={analytics.net >= 0}
            negative={analytics.net < 0}
          />
        </section>
      ) : null}

      <Suspense fallback={<div className="dashboard-loading span-12" />}>
        <DashboardCharts
          trend={analytics.trend}
          netWorthTrend={analytics.netWorthTrend}
          byCategory={analytics.byCategory}
          timeframe={state.timeframe}
          currency={activePortfolio.baseCurrency}
        />
      </Suspense>

      {!isMobile ? (
        <Card className="span-6" title={t("section.history")} id="history-section">
          <Suspense fallback={<div className="panel-loading" />}>
            <TransactionHistory
              transactions={dashboardTransactions}
              onEdit={openEditTransactionDrawer}
              onDelete={confirmDeleteTransaction}
            />
          </Suspense>
        </Card>
      ) : null}
    </main>
  ) : (
    <section className="empty-portfolio-state">
      <Empty description={t("empty.noPortfolios")} image={Empty.PRESENTED_IMAGE_SIMPLE}>
        <Space>
          <Button type="primary" icon={<Plus size={16} />} onClick={() => setPortfolioModal(true)}>
            {t("actions.createPortfolio")}
          </Button>
          <Button onClick={confirmResetDemo}>{t("actions.resetDemo")}</Button>
        </Space>
      </Empty>
    </section>
  );

  return (
    <>
      <Layout className="app-shell">
        <Sider
          width={336}
          collapsedWidth={72}
          collapsed={siderCollapsed}
          className="app-sider"
        >
          <div className="brand">
            <span className="brand-mark">F</span>
            {!siderCollapsed ? <span className="brand-name">Finanko</span> : null}
            <Button
              aria-label={t(siderCollapsed ? "actions.showSidebar" : "actions.hideSidebar")}
              className="sider-collapse-button"
              icon={siderCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              size="small"
              type="text"
              onClick={() => setSiderCollapsed((value) => !value)}
            />
          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={["dashboard"]}
            items={[
              { key: "dashboard", icon: <LayoutDashboard size={17} />, label: t("nav.dashboard") },
              { key: "assistant", icon: <Sparkles size={17} />, label: t("nav.assistant") },
            ]}
            onClick={(item) => {
              if (item.key === "assistant") setAssistantOpen(true);
            }}
          />
          {!siderCollapsed ? (
            <>
              <AccountsPanel
                accounts={accounts}
                transactions={visibleTransactions}
                totalBalance={analytics.totalBalance}
                className="sidebar-accounts"
                onEditAccount={openEditAccountDrawer}
                onArchiveAccount={confirmArchiveAccount}
              />
              <div className="sider-user">
                <Text className="muted">{currentUser?.email}</Text>
                <div className="sider-tools">
                  <Button block onClick={confirmResetDemo}>
                    {t("actions.resetDemo")}
                  </Button>
                  <Button block icon={<Download size={15} />} onClick={exportLocalBackup}>
                    {t("actions.exportBackup")}
                  </Button>
                  <Upload
                    accept="application/json,.json"
                    beforeUpload={(file) => {
                      void importLocalBackup(file);
                      return false;
                    }}
                    className="block-upload"
                    maxCount={1}
                    showUploadList={false}
                  >
                    <Button block icon={<UploadCloud size={15} />}>
                      {t("actions.importBackup")}
                    </Button>
                  </Upload>
                </div>
                <Button block icon={<LogOut size={16} />} onClick={signOut}>
                  {t("actions.signOut")}
                </Button>
              </div>
            </>
          ) : null}
        </Sider>
        <Content className="shell-content">
          <header className="toolbar">
            <div>
              <Text className="muted">{t("section.activePortfolio")}</Text>
              <Space size={10} style={{ display: "flex", marginTop: 6 }}>
                <Select
                  value={activePortfolio?.id}
                  placeholder={t("empty.noPortfolios")}
                  style={{ minWidth: 190 }}
                  options={portfolios.map((portfolio) => ({
                    value: portfolio.id,
                    label: getPortfolioName(portfolio, t),
                  }))}
                  onChange={state.setActivePortfolio}
                />
                <Button
                  className="desktop-action"
                  icon={<Plus size={16} />}
                  onClick={() => setPortfolioModal(true)}
                />
                <Button
                  danger
                  className="desktop-action"
                  disabled={!activePortfolio}
                  onClick={() => setDeletePortfolioModal(true)}
                >
                  {t("actions.delete")}
                </Button>
              </Space>
            </div>
            <div className="toolbar-actions">
              <Segmented
                className="timeframe-filter"
                value={state.timeframe}
                options={TIMEFRAME_OPTIONS.map((option) => ({
                  ...option,
                  label: t(option.label),
                }))}
                onChange={(value) => state.setTimeframe(value as Timeframe)}
              />
              <Segmented
                className="transaction-type-filter"
                value={state.transactionFilter}
                options={[
                  { label: t("filter.all"), value: "all" },
                  { label: t("filter.income"), value: "income" },
                  { label: t("filter.expense"), value: "expense" },
                ]}
                onChange={(value) => state.setTransactionFilter(value as TransactionFilter)}
              />
              <Button className="desktop-action" icon={<Wallet size={16} />} onClick={openNewAccountDrawer}>
                {t("actions.account")}
              </Button>
              <Button
                className="desktop-action"
                icon={<Tags size={16} />}
                disabled={!activePortfolio}
                onClick={() => setCategoryDrawer(true)}
              >
                {t("actions.category")}
              </Button>
              <Button className="desktop-action" icon={<Sparkles size={16} />} onClick={() => setAssistantOpen(true)}>
                {t("actions.assistant")}
              </Button>
              <Button
                type="primary"
                icon={<Plus size={16} />}
                disabled={!activePortfolio}
                onClick={openNewTransactionDrawer}
              >
                {t("actions.transaction")}
              </Button>
              <Button
                className="mobile-menu-button"
                icon={<MenuIcon size={18} />}
                onClick={() => setMobileMenuOpen(true)}
              />
            </div>
          </header>

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
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        placement="right"
        width="min(320px, 86vw)"
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
          <Button
            block
            icon={<Plus size={16} />}
            onClick={() => {
              setMobileMenuOpen(false);
              setPortfolioModal(true);
            }}
          >
            {t("actions.createPortfolio")}
          </Button>
          <Button
            block
            danger
            disabled={!activePortfolio}
            onClick={() => {
              setMobileMenuOpen(false);
              setDeletePortfolioModal(true);
            }}
          >
            {t("actions.deletePortfolio")}
          </Button>
          <Button
            block
            icon={<Wallet size={16} />}
            onClick={() => {
              setMobileMenuOpen(false);
              openNewAccountDrawer();
            }}
          >
            {t("actions.account")}
          </Button>
          <Button
            block
            disabled={!activePortfolio}
            icon={<Tags size={16} />}
            onClick={() => {
              setMobileMenuOpen(false);
              setCategoryDrawer(true);
            }}
          >
            {t("actions.category")}
          </Button>
          <Button
            block
            icon={<Sparkles size={16} />}
            onClick={() => {
              setMobileMenuOpen(false);
              setAssistantOpen(true);
            }}
          >
            {t("actions.assistant")}
          </Button>
          <Button block onClick={confirmResetDemo}>
            {t("actions.resetDemo")}
          </Button>
          <Button block onClick={exportLocalBackup}>
            {t("actions.exportBackup")}
          </Button>
          <Upload
            accept="application/json,.json"
            beforeUpload={(file) => {
              void importLocalBackup(file);
              return false;
            }}
            className="block-upload"
            maxCount={1}
            showUploadList={false}
          >
            <Button block>{t("actions.importBackup")}</Button>
          </Upload>
          <Button block icon={<LogOut size={16} />} onClick={signOut}>
            {t("actions.signOut")}
          </Button>
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
              onModeChange={setInputMode}
              onFinish={addTransaction}
              onParseText={mockTextParser}
              onParseReceipt={mockReceiptParser}
            />
          </Suspense>
        ) : null}
      </Drawer>

      <Modal
        title={t("modal.newPortfolio")}
        open={portfolioModal}
        onCancel={() => setPortfolioModal(false)}
        footer={null}
      >
        {portfolioModal ? (
          <Suspense fallback={<div className="panel-loading" />}>
            <PortfolioForm form={portfolioForm} onFinish={addPortfolio} />
          </Suspense>
        ) : null}
      </Modal>

      {deletePortfolioModal ? (
        <Suspense fallback={null}>
          <DeletePortfolioModal
            open={deletePortfolioModal}
            portfolio={activePortfolio}
            onCancel={() => setDeletePortfolioModal(false)}
            onConfirm={(portfolioId) => {
              state.deletePortfolio(portfolioId);
              setDeletePortfolioModal(false);
            }}
          />
        </Suspense>
      ) : null}

      <div className="language-switcher">
        <Segmented
          size="small"
          value={locale}
          options={[
            { label: "EN", value: "en" },
            { label: "RU", value: "ru" },
          ]}
          onChange={(value) => setLocale(value as "en" | "ru")}
        />
      </div>

      {assistantOpen ? (
        <Suspense fallback={null}>
          <AssistantDialog
            open={assistantOpen}
            summary={assistantSummary!}
            onClose={() => setAssistantOpen(false)}
          />
        </Suspense>
      ) : null}
    </>
  );
}
