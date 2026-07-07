import {
  App as AntApp,
  Button,
  Card,
  Drawer,
  Form,
  Layout,
  Menu,
  Modal,
  Segmented,
  Select,
  Space,
  Tabs,
  Typography,
} from "antd";
import {
  BarChart3,
  CreditCard,
  LogOut,
  LayoutDashboard,
  Plus,
  ReceiptText,
  Sparkles,
  Wallet,
} from "lucide-react";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useFinanceStore } from "../finance/financeStore";
import {
  buildAnalytics,
  filterVisibleTransactions,
} from "../finance/selectors";
import { TIMEFRAME_OPTIONS } from "../../shared/constants/finance";
import { MetricCard } from "./components/MetricCard";
import { DashboardCharts } from "./components/DashboardCharts";
import { AccountsPanel } from "./components/AccountsPanel";
import { useAuthStore } from "../auth/authStore";
import { AccountForm, type AccountFormValues } from "../accounts/AccountForm";
import { DeletePortfolioModal } from "../portfolios/DeletePortfolioModal";
import { PortfolioForm, type PortfolioFormValues } from "../portfolios/PortfolioForm";
import {
  TransactionForm,
  type TransactionFormValues,
} from "../transactions/TransactionForm";
import { TransactionHistory } from "../transactions/TransactionHistory";
import { parseReceiptMock, parseTextExpenseMock } from "../receipts/expenseParser";
import {
  buildAssistantSummary,
} from "../assistant/assistantSummary";
import { AssistantDialog } from "../assistant/AssistantDialog";
import type {
  Account,
  Timeframe,
  Transaction,
} from "../../shared/types/finance";
import { confirmDanger } from "../../shared/ui/confirmations";
import {
  getAccountName,
  getPortfolioName,
  getTransactionDescription,
} from "../../shared/i18n/displayText";
import { useI18n } from "../../shared/i18n/i18nContext";

const { Content, Sider } = Layout;
const { Text } = Typography;

export function FinanceDashboard() {
  const { modal, message } = AntApp.useApp();
  const { locale, setLocale, t } = useI18n();
  const [accountDrawer, setAccountDrawer] = useState(false);
  const [transactionDrawer, setTransactionDrawer] = useState(false);
  const [portfolioModal, setPortfolioModal] = useState(false);
  const [deletePortfolioModal, setDeletePortfolioModal] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [inputMode, setInputMode] = useState("manual");
  const [accountForm] = Form.useForm();
  const [transactionForm] = Form.useForm();
  const [portfolioForm] = Form.useForm();
  const [textParserForm] = Form.useForm();

  const state = useFinanceStore();
  const { signOut, user } = useAuthStore();
  const currentUser = user();
  const generateDueRecurring = useFinanceStore((store) => store.generateDueRecurring);

  useEffect(() => {
    generateDueRecurring();
  }, [generateDueRecurring]);

  const activePortfolio = state.portfolios.find(
    (portfolio) => portfolio.id === state.activePortfolioId && !portfolio.deletedAt,
  );
  const portfolios = state.portfolios.filter((portfolio) => !portfolio.deletedAt);
  const accounts = state.accounts.filter(
    (account) => account.portfolioId === state.activePortfolioId && !account.deletedAt,
  );
  const categories = state.categories.filter(
    (category) => category.portfolioId === state.activePortfolioId,
  );
  const visibleTransactions = filterVisibleTransactions(
    state.transactions,
    state.activePortfolioId,
  );

  const analytics = useMemo(
    () =>
      buildAnalytics(
        accounts,
        categories,
        visibleTransactions,
        state.timeframe,
        activePortfolio?.baseCurrency ?? "USD",
      ),
    [accounts, categories, visibleTransactions, state.timeframe, activePortfolio?.baseCurrency],
  );
  const assistantSummary = useMemo(
    () =>
      buildAssistantSummary(
      accounts,
      categories,
      visibleTransactions,
      state.timeframe,
      activePortfolio?.baseCurrency ?? "USD",
      ),
    [accounts, categories, visibleTransactions, state.timeframe, activePortfolio?.baseCurrency],
  );

  function addAccount(values: AccountFormValues) {
    state.addAccount(values);
    accountForm.resetFields();
    setAccountDrawer(false);
    message.success(t("feedback.accountAdded"));
  }

  function addTransaction(values: TransactionFormValues) {
    state.addTransaction({
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
    });
    transactionForm.resetFields();
    setTransactionDrawer(false);
    message.success(t("feedback.transactionSaved"));
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

  function mockTextParser(values: { text: string }) {
    const accountId = accounts[0]?.id;
    if (!accountId) {
      message.warning(t("feedback.createAccountFirst"));
      return;
    }
    const parsed = parseTextExpenseMock({
      text: values.text,
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
      source: "text_ai",
      items: parsed.items,
    });
    setInputMode("manual");
    message.success(t("feedback.parserPrepared"));
  }

  function mockReceiptParser(values: { fileName: string }) {
    const accountId = accounts[0]?.id;
    if (!accountId) {
      message.warning(t("feedback.createAccountFirst"));
      return;
    }
    const parsed = parseReceiptMock({
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

  return (
    <>
      <Layout className="app-shell">
        <Sider width={280} className="app-sider">
          <div className="brand">
            <span className="brand-mark">F</span>
            <span className="brand-name">Finanko</span>
          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={["dashboard"]}
            items={[
              { key: "dashboard", icon: <LayoutDashboard size={17} />, label: t("nav.dashboard") },
              { key: "accounts", icon: <Wallet size={17} />, label: t("nav.accounts") },
              { key: "history", icon: <ReceiptText size={17} />, label: t("nav.history") },
              { key: "assistant", icon: <Sparkles size={17} />, label: t("nav.assistant") },
            ]}
            onClick={(item) => {
              if (item.key === "assistant") setAssistantOpen(true);
            }}
          />
          <AccountsPanel
            accounts={accounts}
            transactions={visibleTransactions}
            totalBalance={analytics.totalBalance}
            className="sidebar-accounts"
            onArchiveAccount={confirmArchiveAccount}
          />
          <div className="sider-user">
            <Text className="muted">{currentUser?.email}</Text>
            <Button block icon={<LogOut size={16} />} onClick={signOut}>
              {t("actions.signOut")}
            </Button>
          </div>
        </Sider>
        <Content className="shell-content">
          <header className="toolbar">
            <div>
              <Text className="muted">{t("section.activePortfolio")}</Text>
              <Space size={10} style={{ display: "flex", marginTop: 6 }}>
                <Select
                  value={state.activePortfolioId}
                  style={{ minWidth: 190 }}
                  options={portfolios.map((portfolio) => ({
                    value: portfolio.id,
                    label: getPortfolioName(portfolio, t),
                  }))}
                  onChange={state.setActivePortfolio}
                />
                <Button icon={<Plus size={16} />} onClick={() => setPortfolioModal(true)} />
                <Button danger onClick={() => setDeletePortfolioModal(true)}>
                  {t("actions.delete")}
                </Button>
              </Space>
            </div>
            <div className="toolbar-actions">
              <Segmented
                value={state.timeframe}
                options={TIMEFRAME_OPTIONS.map((option) => ({
                  ...option,
                  label: t(option.label),
                }))}
                onChange={(value) => state.setTimeframe(value as Timeframe)}
              />
              <Button icon={<Wallet size={16} />} onClick={() => setAccountDrawer(true)}>
                {t("actions.account")}
              </Button>
              <Button icon={<Sparkles size={16} />} onClick={() => setAssistantOpen(true)}>
                {t("actions.assistant")}
              </Button>
              <Button
                type="primary"
                icon={<Plus size={16} />}
                onClick={() => setTransactionDrawer(true)}
              >
                {t("actions.transaction")}
              </Button>
            </div>
          </header>

          <main className="dashboard-grid">
            <section className="metrics-row">
              <MetricCard
                title={t("metric.netWorth")}
                value={analytics.netWorth}
                currency={activePortfolio?.baseCurrency ?? "USD"}
                positive={analytics.netWorth >= 0}
                negative={analytics.netWorth < 0}
              />
              <MetricCard
                title={t("metric.savings")}
                value={analytics.savingsTotal}
                currency={activePortfolio?.baseCurrency ?? "USD"}
              />
              <MetricCard
                title={t("metric.income")}
                value={analytics.income}
                currency={activePortfolio?.baseCurrency ?? "USD"}
                positive
              />
              <MetricCard
                title={t("metric.expenses")}
                value={analytics.expenses}
                currency={activePortfolio?.baseCurrency ?? "USD"}
                negative
              />
              <MetricCard
                title={t("metric.netFlow")}
                value={analytics.net}
                currency={activePortfolio?.baseCurrency ?? "USD"}
                positive={analytics.net >= 0}
                negative={analytics.net < 0}
              />
            </section>

            <DashboardCharts
              trend={analytics.trend}
              netWorthTrend={analytics.netWorthTrend}
              byCategory={analytics.byCategory}
              timeframe={state.timeframe}
              currency={activePortfolio?.baseCurrency ?? "USD"}
            />

            <Card className="span-6" title={t("section.history")}>
              <TransactionHistory
                transactions={visibleTransactions}
                onDelete={confirmDeleteTransaction}
              />
            </Card>
          </main>
        </Content>
      </Layout>

      <Tabs
        className="mobile-tabs"
        centered
        items={[
          { key: "dashboard", label: <BarChart3 size={18} /> },
          { key: "accounts", label: <CreditCard size={18} /> },
          { key: "assistant", label: <Sparkles size={18} /> },
        ]}
        onChange={(key) => {
          if (key === "assistant") setAssistantOpen(true);
        }}
      />

      <Drawer
        title={t("drawer.newAccount")}
        open={accountDrawer}
        onClose={() => setAccountDrawer(false)}
        width={420}
      >
        <AccountForm form={accountForm} onFinish={addAccount} />
      </Drawer>

      <Drawer
        title={t("drawer.newTransaction")}
        open={transactionDrawer}
        onClose={() => setTransactionDrawer(false)}
        width={500}
      >
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
      </Drawer>

      <Modal
        title={t("modal.newPortfolio")}
        open={portfolioModal}
        onCancel={() => setPortfolioModal(false)}
        footer={null}
      >
        <PortfolioForm form={portfolioForm} onFinish={addPortfolio} />
      </Modal>

      <DeletePortfolioModal
        open={deletePortfolioModal}
        portfolio={activePortfolio}
        onCancel={() => setDeletePortfolioModal(false)}
        onConfirm={(portfolioId) => {
          state.deletePortfolio(portfolioId);
          setDeletePortfolioModal(false);
        }}
      />

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

      <AssistantDialog
        open={assistantOpen}
        summary={assistantSummary}
        onClose={() => setAssistantOpen(false)}
      />
    </>
  );
}
