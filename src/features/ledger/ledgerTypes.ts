import type { AccountType, Currency, TransactionSource } from "../../shared/types/finance";

export type LedgerEntryKind =
  | "income"
  | "expense"
  | "adjustment"
  | "interest_accrual"
  | "debt_payment"
  | "opening_balance";

export type PostingDirection = "increase" | "decrease";

export type PostingRole =
  | "cash"
  | "income"
  | "expense"
  | "liability_principal"
  | "liability_interest"
  | "adjustment";

export interface LedgerAccount {
  id: string;
  portfolioId: string;
  name: string;
  type: AccountType;
  currency: Currency;
  openingBalanceMinor: number;
  deletedAt?: string;
}

export interface LedgerCategory {
  id: string;
  portfolioId: string;
  type: "income" | "expense";
}

export interface Posting {
  id: string;
  entryId: string;
  accountId?: string;
  categoryId?: string;
  amountMinor: number;
  currency: Currency;
  direction: PostingDirection;
  role: PostingRole;
}

export interface LedgerEntry {
  id: string;
  portfolioId: string;
  kind: LedgerEntryKind;
  occurredAt: string;
  description: string;
  source: TransactionSource | "system";
  deletedAt?: string;
  postings: Posting[];
}

export interface EntryItem {
  id: string;
  entryId: string;
  name: string;
  amountMinor: number;
  currency: Currency;
  categoryId: string;
  confidence: number;
}

export interface LedgerSnapshot {
  accounts: LedgerAccount[];
  categories: LedgerCategory[];
  entries: LedgerEntry[];
  items: EntryItem[];
}
