import type {
  Account,
  AccountType,
  Category,
  Currency,
  TransactionItem,
  TransactionSource,
  Portfolio,
  RecurringRule,
  Timeframe,
  Transaction,
  TransactionType,
} from "../../shared/types/finance";

export interface NewAccountInput {
  name: string;
  type: AccountType;
  currency: Currency;
  initialBalance: number;
}

export interface NewTransactionInput {
  accountId: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  categoryId: string;
  description: string;
  occurredAt: string;
  source?: TransactionSource;
  items?: Array<{
    name: string;
    amount: number;
    categoryId: string;
    confidence: number;
  }>;
  recurring?: boolean;
}

export interface FinanceState {
  activePortfolioId: string;
  timeframe: Timeframe;
  portfolios: Portfolio[];
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  transactionItems: TransactionItem[];
  recurringRules: RecurringRule[];
  setActivePortfolio: (id: string) => void;
  setTimeframe: (timeframe: Timeframe) => void;
  addPortfolio: (name: string, baseCurrency: Currency) => void;
  deletePortfolio: (id: string) => void;
  addAccount: (input: NewAccountInput) => void;
  archiveAccount: (id: string) => void;
  addTransaction: (input: NewTransactionInput) => void;
  deleteTransaction: (id: string) => void;
  generateDueRecurring: () => void;
}

export interface FinanceSnapshot {
  activePortfolioId: string;
  timeframe: Timeframe;
  portfolios: Portfolio[];
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  transactionItems: TransactionItem[];
  recurringRules: RecurringRule[];
}
