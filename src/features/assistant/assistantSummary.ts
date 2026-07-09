import type {
  Account,
  Category,
  Currency,
  Timeframe,
  Transaction,
} from "../../shared/types/finance";
import { buildAnalytics, filterPeriodTransactions } from "../finance/selectors";
import type en from "../../shared/i18n/en.json";
import type { MessageKey } from "../../shared/i18n/i18nContext";
import { getCategoryNameById } from "../../shared/i18n/displayText";
import { convertMoney } from "../../shared/lib/currency";
import { isLiabilityAccount } from "../../shared/lib/accounts";

type Translator = (
  key: keyof typeof en,
  values?: Record<string, string | number>,
) => string;

export interface AssistantSummary {
  timeframe: Timeframe;
  currency: Currency;
  incomeTotal: number;
  expenseTotal: number;
  netFlow: number;
  topCategories: Array<{ id: string; name: string; amount: number }>;
  recurringTotal: number;
  accountCount: number;
  interestAccountCount: number;
  debtAccountCount: number;
  highestInterestRate: number;
}

export type AssistantActionId =
  | "portfolio_overview"
  | "category_spending"
  | "expense_optimization";

export interface AssistantActionDefinition {
  id: AssistantActionId;
  label: MessageKey;
  userDescription: string;
  backendDescription: string;
}

export const ASSISTANT_ACTIONS: AssistantActionDefinition[] = [
  {
    id: "portfolio_overview",
    label: "assistant.action.portfolio",
    userDescription: "Review the whole portfolio and highlight the main financial patterns.",
    backendDescription:
      "Use only compact portfolio aggregates. Return non-advisory observations about cashflow, savings, recurring costs, and net worth movement.",
  },
  {
    id: "category_spending",
    label: "assistant.action.category",
    userDescription: "Explain the biggest spending category and why it matters.",
    backendDescription:
      "Use the highest expense category from the aggregate summary. Do not accept user-provided category text. Describe pattern, impact, and tradeoffs.",
  },
  {
    id: "expense_optimization",
    label: "assistant.action.optimize",
    userDescription: "Find a realistic spending optimization scenario with clear tradeoffs.",
    backendDescription:
      "Use aggregate category totals to propose conservative scenario analysis. Avoid regulated financial advice and investment recommendations.",
  },
];

export function buildAssistantSummary(
  accounts: Account[],
  categories: Category[],
  transactions: Transaction[],
  timeframe: Timeframe,
  currency: Currency,
): AssistantSummary {
  const analytics = buildAnalytics(accounts, categories, transactions, timeframe, currency);
  const periodTransactions = filterPeriodTransactions(transactions, timeframe);
  const topCategories = categories
    .filter((category) => category.type === "expense")
    .map((category) => ({
      id: category.id,
      name: category.name,
      amount: periodTransactions
        .filter(
          (transaction) =>
            transaction.type === "expense" &&
            transaction.categoryId === category.id,
        )
        .reduce(
          (sum, transaction) =>
            sum +
            convertMoney(
              transaction.amount,
              transaction.currency,
              currency,
              transaction.occurredAt,
            ),
          0,
        ),
    }))
    .filter((category) => category.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
  const recurringTotal = periodTransactions
    .filter((transaction) => transaction.source === "recurring")
    .reduce(
      (sum, transaction) =>
        sum +
        convertMoney(
          transaction.amount,
          transaction.currency,
          currency,
          transaction.occurredAt,
        ),
      0,
    );
  const interestAccounts = accounts.filter((account) => account.annualInterestRate);
  const debtAccounts = accounts.filter(isLiabilityAccount);

  return {
    timeframe,
    currency,
    incomeTotal: analytics.income,
    expenseTotal: analytics.expenses,
    netFlow: analytics.net,
    topCategories,
    recurringTotal,
    accountCount: accounts.length,
    interestAccountCount: interestAccounts.length,
    debtAccountCount: debtAccounts.length,
    highestInterestRate: Math.max(
      0,
      ...interestAccounts.map((account) => account.annualInterestRate ?? 0),
    ),
  };
}

export function getAssistantObservationMock(summary: AssistantSummary) {
  return getAssistantResponseMock("expense_optimization", summary, undefined, (key) => key);
}

export function getAssistantResponseMock(
  actionId: AssistantActionId,
  summary: AssistantSummary,
  selectedCategoryId?: string,
  t: Translator = (key) => key,
) {
  const topCategory =
    summary.topCategories.find((category) => category.id === selectedCategoryId) ??
    summary.topCategories[0];
  if (!topCategory) {
    return t("assistant.noData");
  }

  if (actionId === "portfolio_overview") {
    return t("assistant.response.portfolio", {
      currency: summary.currency,
      income: Math.round(summary.incomeTotal),
      expenses: Math.round(summary.expenseTotal),
      net: Math.round(summary.netFlow),
      debts: summary.debtAccountCount,
      interestAccounts: summary.interestAccountCount,
      highestRate: Math.round(summary.highestInterestRate * 10) / 10,
    });
  }

  if (actionId === "category_spending") {
    return t("assistant.response.category", {
      category: getCategoryNameById(topCategory.id, topCategory.name, t),
      currency: summary.currency,
      amount: Math.round(topCategory.amount),
    });
  }

  const reduced = Math.round(topCategory.amount * 0.15);
  const yearly = reduced * 12;

  return t("assistant.response.optimize", {
    category: getCategoryNameById(topCategory.id, topCategory.name, t),
    currency: summary.currency,
    periodAmount: reduced,
    yearAmount: yearly,
  });
}
