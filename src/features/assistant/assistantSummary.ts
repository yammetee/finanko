import type { Account, Category, Currency, Timeframe, Transaction, TransactionItem } from "../../shared/types/finance";
import { buildAnalytics, filterPeriodTransactions, getAccountBalanceInCurrency, getPeriod } from "../finance/selectors";
import { isLiabilityAccount } from "../../shared/lib/accounts";
import dayjs from "dayjs";

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
  accounts: Array<{ name: string; type: Account["type"]; balance: number; annualInterestRate: number | null }>;
  interestAccountCount: number;
  highestInterestRate: number;
  dataQuality: {
    hasIncome: boolean;
    hasExpenses: boolean;
    isSparse: boolean;
    canProject: boolean;
    observedDays: number;
    periodElapsedDays: number;
    coverageStart: string | null;
    coverageEnd: string | null;
  };
}

export interface AssistantRecommendation {
  priority: number;
  title: string;
  action: string;
  rationale: string;
  target: string;
  tone: "positive" | "warning" | "critical" | "neutral";
}

export interface AssistantResponse {
  verdict: string;
  diagnosis: string;
  recommendations: AssistantRecommendation[];
  nextReview: string;
  disclaimer: string;
}

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
  const transactionDates = periodTransactions
    .map((transaction) => dayjs(transaction.occurredAt))
    .filter((date) => date.isValid())
    .sort((a, b) => a.valueOf() - b.valueOf());
  const observedDays = new Set(transactionDates.map((date) => date.format("YYYY-MM-DD"))).size;
  const now = dayjs();
  const periodStart = getPeriod(timeframe, now)?.start ?? transactionDates[0] ?? now;
  const periodElapsedDays = Math.max(1, now.startOf("day").diff(periodStart.startOf("day"), "day") + 1);
  const canProject = periodTransactions.length >= 10 && observedDays >= 7;

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
    accounts: accountBalances.map(({ account, balance }) => ({
      name: account.name,
      type: account.type,
      balance: round(balance),
      annualInterestRate: account.annualInterestRate ?? null,
    })),
    interestAccountCount: interestAccounts.length,
    highestInterestRate: Math.max(0, ...interestAccounts.map((account) => account.annualInterestRate ?? 0)),
    dataQuality: {
      hasIncome: analytics.income > 0,
      hasExpenses: analytics.expenses > 0,
      isSparse: !canProject,
      canProject,
      observedDays,
      periodElapsedDays,
      coverageStart: transactionDates[0]?.format("YYYY-MM-DD") ?? null,
      coverageEnd: transactionDates[transactionDates.length - 1]?.format("YYYY-MM-DD") ?? null,
    },
  };
}
