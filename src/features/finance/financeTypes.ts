import type {
  Account,
  AccountType,
  Category,
  Currency,
  InterestFrequency,
  TransactionItem,
  TransactionSource,
  Portfolio,
  RecurringRule,
  Timeframe,
  Transaction,
  TransactionType,
} from "../../shared/types/finance";

export type TransactionFilter = "all" | "income" | "expense";
export type CurrencyDisplayMode = Currency | "native";

export interface NewAccountInput {
  name: string;
  type: AccountType;
  currency: Currency;
  initialBalance: number;
  annualInterestRate?: number;
  interestFrequency?: InterestFrequency;
  interestStartedAt?: string;
  interestAllocationAccountId?: string;
  loanTermMonths?: number;
}

export interface NewCategoryInput {
  name: string;
  type: Category["type"];
  color: string;
}

export interface NewTransactionInput {
  accountId: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  categoryId: string;
  linkedAccountId?: string;
  principalAmount?: number;
  interestAmount?: number;
  description: string;
  occurredAt: string;
  source?: TransactionSource;
  items?: Array<{
    name: string;
    amount: number;
    quantity?: number;
    unitPrice?: number;
    categoryId: string;
    confidence: number;
  }>;
  recurring?: boolean;
  recurringMonths?: number;
}

export interface FinanceState {
  activePortfolioId: string;
  timeframe: Timeframe;
  transactionFilter: TransactionFilter;
  currencyDisplay: CurrencyDisplayMode;
  portfolios: Portfolio[];
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  transactionItems: TransactionItem[];
  recurringRules: RecurringRule[];
  setActivePortfolio: (id: string) => void;
  setTimeframe: (timeframe: Timeframe) => void;
  setTransactionFilter: (filter: TransactionFilter) => void;
  setCurrencyDisplay: (currencyDisplay: CurrencyDisplayMode) => void;
  addPortfolio: (name: string, baseCurrency: Currency) => void;
  deletePortfolio: (id: string) => void;
  addAccount: (input: NewAccountInput) => void;
  updateAccount: (id: string, input: NewAccountInput) => void;
  archiveAccount: (id: string) => void;
  repairAccountCurrencies: () => void;
  addCategory: (input: NewCategoryInput) => void;
  addTransaction: (input: NewTransactionInput) => void;
  updateTransaction: (id: string, input: NewTransactionInput) => void;
  deleteTransaction: (id: string) => void;
  generateDueRecurring: () => void;
  resetLocalData: () => void;
}

export interface FinanceSnapshot {
  activePortfolioId: string;
  timeframe: Timeframe;
  transactionFilter: TransactionFilter;
  currencyDisplay: CurrencyDisplayMode;
  portfolios: Portfolio[];
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  transactionItems: TransactionItem[];
  recurringRules: RecurringRule[];
}
