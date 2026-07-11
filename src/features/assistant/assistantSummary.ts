import type { Account, Category, Currency, Timeframe, Transaction, TransactionItem } from "../../shared/types/finance";
import { buildAnalytics, filterPeriodTransactions, getAccountBalanceInCurrency } from "../finance/selectors";
import type { MessageKey } from "../../shared/i18n/i18nContext";
import { isLiabilityAccount } from "../../shared/lib/accounts";

export interface AssistantSummary {
  timeframe: Timeframe;
  currency: Currency;
  incomeTotal: number;
  expenseTotal: number;
  netFlow: number;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  savingsRatePercent: number | null;
  expenseToIncomePercent: number | null;
  topCategories: Array<{ id: string; name: string; amount: number; sharePercent: number }>;
  recurringIncome: number;
  recurringExpenses: number;
  transactionCount: number;
  expenseTransactionCount: number;
  accountCount: number;
  debtAccounts: Array<{ type: Account["type"]; balance: number; annualInterestRate: number | null }>;
  interestAccountCount: number;
  highestInterestRate: number;
  dataQuality: {
    hasIncome: boolean;
    hasExpenses: boolean;
    isSparse: boolean;
  };
}

export interface AssistantInsight {
  label: string;
  value: string;
  detail: string;
  tone: "positive" | "warning" | "critical" | "neutral";
}

export interface AssistantScenario {
  title: string;
  impact: string;
  tradeoff: string;
}

export interface AssistantResponse {
  headline: string;
  summary: string;
  insights: AssistantInsight[];
  scenarios: AssistantScenario[];
  caveats: string[];
}

export type AssistantActionId = "portfolio_overview" | "category_spending" | "expense_optimization" | "debt_health";

export interface AssistantActionDefinition {
  id: AssistantActionId;
  label: MessageKey;
  backendDescription: string;
}

export const ASSISTANT_ACTIONS: AssistantActionDefinition[] = [
  {
    id: "portfolio_overview",
    label: "assistant.action.portfolio",
    backendDescription: "Analyze the balance sheet and period cash flow separately. Identify the two most material observations, explain whether negative net worth comes from liabilities or current spending, and mention data limitations.",
  },
  {
    id: "category_spending",
    label: "assistant.action.category",
    backendDescription: "Analyze only the selected expense category: its share of all expenses, materiality relative to income, and transaction frequency. Give category-specific observations without assuming that the spending is wasteful.",
  },
  {
    id: "expense_optimization",
    label: "assistant.action.optimize",
    backendDescription: "Build three distinct conservative scenarios from actual category and recurring-expense totals. Quantify period impact using the supplied timeframe. Every scenario must state a practical tradeoff; do not multiply an all-time total as if it were monthly.",
  },
  {
    id: "debt_health",
    label: "assistant.action.debt",
    backendDescription: "Analyze liabilities separately from expenses. Compare total liabilities with assets and period net flow, highlight the highest configured rate, and describe payoff scenarios without telling the user to refinance, borrow, or buy financial products.",
  },
];

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildAssistantSummary(
  accounts: Account[],
  categories: Category[],
  transactions: Transaction[],
  timeframe: Timeframe,
  currency: Currency,
  transactionItems: TransactionItem[] = [],
): AssistantSummary {
  const analytics = buildAnalytics(accounts, categories, transactions, timeframe, currency, transactionItems);
  const periodTransactions = filterPeriodTransactions(transactions, timeframe).filter((transaction) => !transaction.deletedAt);
  const activeAccounts = accounts.filter((account) => !account.deletedAt);
  const accountBalances = activeAccounts.map((account) => ({
    account,
    balance: getAccountBalanceInCurrency(account, transactions, currency, undefined, activeAccounts),
  }));
  const debtAccounts = accountBalances.filter(({ account }) => isLiabilityAccount(account));
  const totalAssets = accountBalances
    .filter(({ account }) => !isLiabilityAccount(account))
    .reduce((sum, item) => sum + Math.max(0, item.balance), 0);
  const negativeAssetBalances = accountBalances
    .filter(({ account, balance }) => !isLiabilityAccount(account) && balance < 0)
    .reduce((sum, item) => sum + Math.abs(item.balance), 0);
  const totalLiabilities = debtAccounts.reduce((sum, item) => sum + Math.abs(item.balance), negativeAssetBalances);
  const topCategories = [...analytics.byCategory]
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((category) => ({
      id: category.id,
      name: category.name,
      amount: round(category.value),
      sharePercent: analytics.expenses > 0 ? round(category.value / analytics.expenses * 100) : 0,
    }));
  const recurring = periodTransactions.filter((transaction) => transaction.source === "recurring");
  const recurringAnalytics = buildAnalytics(activeAccounts, categories, recurring, "all", currency, transactionItems);
  const interestAccounts = activeAccounts.filter((account) => (account.annualInterestRate ?? 0) > 0);

  return {
    timeframe,
    currency,
    incomeTotal: round(analytics.income),
    expenseTotal: round(analytics.expenses),
    netFlow: round(analytics.net),
    netWorth: round(analytics.netWorth),
    totalAssets: round(totalAssets),
    totalLiabilities: round(totalLiabilities),
    savingsRatePercent: analytics.income > 0 ? round(analytics.net / analytics.income * 100) : null,
    expenseToIncomePercent: analytics.income > 0 ? round(analytics.expenses / analytics.income * 100) : null,
    topCategories,
    recurringIncome: round(recurringAnalytics.income),
    recurringExpenses: round(recurringAnalytics.expenses),
    transactionCount: periodTransactions.length,
    expenseTransactionCount: periodTransactions.filter((transaction) => transaction.type === "expense").length,
    accountCount: activeAccounts.length,
    debtAccounts: debtAccounts.map(({ account, balance }) => ({
      type: account.type,
      balance: round(Math.abs(balance)),
      annualInterestRate: account.annualInterestRate ?? null,
    })),
    interestAccountCount: interestAccounts.length,
    highestInterestRate: Math.max(0, ...interestAccounts.map((account) => account.annualInterestRate ?? 0)),
    dataQuality: {
      hasIncome: analytics.income > 0,
      hasExpenses: analytics.expenses > 0,
      isSparse: periodTransactions.length < 5,
    },
  };
}

export function getAssistantResponseFallback(actionId: AssistantActionId, summary: AssistantSummary, locale: "en" | "ru" = "en", selectedCategoryId?: string): AssistantResponse {
  const ru = locale === "ru";
  const currency = summary.currency;
  const top = summary.topCategories.find((category) => category.id === selectedCategoryId) ?? summary.topCategories[0];
  const sparse = summary.dataQuality.isSparse ? [ru ? "В выбранном периоде мало операций, поэтому устойчивый паттерн пока не виден." : "The selected period has too few operations for a stable pattern."] : [];
  const common = [{
    label: ru ? "Чистый поток" : "Net flow",
    value: `${currency} ${Math.round(summary.netFlow)}`,
    detail: ru ? `Операций за выбранный период: ${summary.transactionCount}.` : `${summary.transactionCount} recorded operations in the selected period.`,
    tone: summary.netFlow >= 0 ? "positive" as const : "warning" as const,
  }];

  if (actionId === "debt_health") {
    return {
      headline: summary.totalLiabilities > summary.totalAssets ? (ru ? "Обязательства превышают учтённые активы" : "Liabilities exceed recorded assets") : (ru ? "Учтённые активы покрывают обязательства" : "Recorded assets cover liabilities"),
      summary: ru ? `Активы: ${currency} ${Math.round(summary.totalAssets)}, обязательства: ${currency} ${Math.round(summary.totalLiabilities)}.` : `Assets are ${currency} ${Math.round(summary.totalAssets)} and liabilities are ${currency} ${Math.round(summary.totalLiabilities)}.`,
      insights: [...common, { label: ru ? "Максимальная ставка" : "Highest rate", value: `${summary.highestInterestRate}%`, detail: ru ? `Долговых счетов: ${summary.debtAccounts.length}.` : `${summary.debtAccounts.length} liability accounts are recorded.`, tone: "warning" }],
      scenarios: [], caveats: sparse,
    };
  }
  if (actionId === "category_spending" && top) {
    return { headline: ru ? `${top.name}: ${Math.round(top.sharePercent)}% расходов` : `${top.name} represents ${Math.round(top.sharePercent)}% of expenses`, summary: ru ? `В категории учтено ${currency} ${Math.round(top.amount)}.` : `${currency} ${Math.round(top.amount)} was recorded in this category.`, insights: common, scenarios: [], caveats: sparse };
  }
  if (actionId === "expense_optimization" && top) {
    const impact = Math.round(top.amount * 0.1);
    return { headline: ru ? `Самый измеримый сценарий связан с категорией «${top.name}»` : `A small change in ${top.name} has the clearest measurable effect`, summary: ru ? `Изменение на 10% меняет поток периода примерно на ${currency} ${impact}.` : `A 10% scenario changes period cash flow by about ${currency} ${impact}.`, insights: common,
      scenarios: [{ title: ru ? "Сценарий −10% категории" : "10% category scenario", impact: ru ? `${currency} ${impact} за выбранный период` : `${currency} ${impact} per selected period`, tradeoff: ru ? "Может потребовать снизить частоту или удобство покупок в этой категории." : "May reduce convenience or frequency in this category." }], caveats: sparse };
  }
  return { headline: summary.netFlow >= 0 ? (ru ? "Положительный поток за выбранный период" : "Positive cash flow in the selected period") : (ru ? "Расходы выше учтённых доходов" : "Expenses exceed recorded income"), summary: ru ? `Капитал: ${currency} ${Math.round(summary.netWorth)}, поток периода: ${currency} ${Math.round(summary.netFlow)}.` : `Net worth is ${currency} ${Math.round(summary.netWorth)}; period net flow is ${currency} ${Math.round(summary.netFlow)}.`, insights: common, scenarios: [], caveats: sparse };
}
