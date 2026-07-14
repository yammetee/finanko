import type { Account, Category, Currency, Timeframe, Transaction, TransactionItem } from "../../shared/types/finance";
import { buildAnalytics, filterPeriodTransactions, getAccountBalanceInCurrency, getPeriod } from "../finance/selectors";
import { isLiabilityAccount } from "../../shared/lib/accounts";
import { convertMoney } from "../../shared/lib/currency";
import dayjs from "dayjs";

export interface SpendingOpportunity {
  id: string;
  name: string;
  monthlyAverage: number;
  annualSavings25: number;
  annualSavings50: number;
  currency: Currency;
  occurrences: number;
  observedMonths: number;
}

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
  spendingOpportunities: SpendingOpportunity[];
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

export type AssistantActionType = "add_transaction" | "review_transactions" | "none";

export interface AssistantResponse {
  status: "stable" | "attention" | "critical" | "insufficient_data";
  headline: string;
  summary: string;
  evidence: Array<{ label: string; value: string }>;
  primaryAction: {
    type: AssistantActionType;
    title: string;
    description: string;
    buttonLabel: string | null;
  };
  scenario: {
    opportunityId: string;
    title: string;
    suggestion: string;
    reductionPercent: 25 | 50;
  } | null;
  confidence: number;
  nextCheck: string;
  disclaimer: string;
}

export interface AssistantChatResponse {
  answer: string;
  evidence: Array<{ label: string; value: string }>;
  suggestedQuestions: string[];
  disclaimer: string;
}

export interface ContextInsightResponse {
  headline: string;
  explanation: string;
  factors: string[];
  confidence: number;
}

export interface WeeklyRecapResponse {
  headline: string;
  summary: string;
  highlights: Array<{ label: string; value: string; tone: "positive" | "warning" | "neutral" }>;
  focus: string;
  disclaimer: string;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

const genericItemNames = new Set([
  "adjustment", "food", "item", "other", "product", "total",
  "другое", "еда", "корректировка", "позиция", "продукт", "товар", "итого",
]);

function normalizeItemName(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[\s_]+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "");
}

function buildSpendingOpportunities(
  transactions: Transaction[],
  transactionItems: TransactionItem[],
  currency: Currency,
): SpendingOpportunity[] {
  const now = dayjs();
  const cutoff = now.subtract(90, "day").startOf("day");
  const recentExpenses = new Map(transactions
    .filter((transaction) => !transaction.deletedAt && transaction.type === "expense")
    .filter((transaction) => {
      const date = dayjs(transaction.occurredAt);
      return date.isValid() && !date.isBefore(cutoff) && !date.isAfter(now);
    })
    .map((transaction) => [transaction.id, transaction]));
  const expenseDates = [...recentExpenses.values()].map((transaction) => dayjs(transaction.occurredAt));
  const earliestDate = expenseDates.sort((a, b) => a.valueOf() - b.valueOf())[0];
  const historyDays = earliestDate ? now.startOf("day").diff(earliestDate.startOf("day"), "day") + 1 : 0;
  if (historyDays < 45) return [];

  const coverageMonths = Math.max(2, Math.min(3, historyDays / 30.44));
  const groups = new Map<string, { name: string; total: number; occurrences: number; months: Set<string> }>();

  transactionItems.forEach((item) => {
    const transaction = recentExpenses.get(item.transactionId);
    const key = normalizeItemName(item.name);
    if (!transaction || !key || genericItemNames.has(key) || !Number.isFinite(item.amount) || item.amount <= 0) return;
    const group = groups.get(key) ?? { name: item.name.trim(), total: 0, occurrences: 0, months: new Set<string>() };
    group.total += convertMoney(item.amount, transaction.currency, currency, transaction.occurredAt);
    group.occurrences += 1;
    group.months.add(dayjs(transaction.occurredAt).format("YYYY-MM"));
    groups.set(key, group);
  });

  return [...groups.entries()]
    .filter(([, group]) => group.occurrences >= 3 && group.months.size >= 2)
    .map(([id, group]) => {
      const monthlyAverage = group.total / coverageMonths;
      return {
        id,
        name: group.name,
        monthlyAverage: round(monthlyAverage),
        annualSavings25: round(monthlyAverage * 12 * 0.25),
        annualSavings50: round(monthlyAverage * 12 * 0.5),
        currency,
        occurrences: group.occurrences,
        observedMonths: group.months.size,
      };
    })
    .sort((a, b) => b.annualSavings50 - a.annualSavings50)
    .slice(0, 5);
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
    spendingOpportunities: buildSpendingOpportunities(transactions, transactionItems, currency),
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
