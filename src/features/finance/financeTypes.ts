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
  addPortfolio: (name: string, baseCurrency: Currency) => Promise<void>;
  renamePortfolio: (id: string, name: string) => Promise<void>;
  deletePortfolio: (id: string) => Promise<void>;
  addAccount: (input: NewAccountInput) => Promise<void>;
  updateAccount: (id: string, input: NewAccountInput) => Promise<void>;
  archiveAccount: (id: string) => Promise<void>;
  addCategory: (input: NewCategoryInput) => Promise<void>;
  addTransaction: (input: NewTransactionInput) => Promise<void>;
  updateTransaction: (id: string, input: NewTransactionInput) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  generateDueRecurring: () => Promise<void>;
  resetFinanceData: () => Promise<void>;
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
