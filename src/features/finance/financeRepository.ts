import type { Currency } from "../../shared/types/finance";
import type {
  FinanceSnapshot,
  NewAccountInput,
  NewTransactionInput,
} from "./financeTypes";

export interface FinanceRepository {
  getSnapshot: () => Promise<FinanceSnapshot>;
  createPortfolio: (name: string, baseCurrency: Currency) => Promise<void>;
  deletePortfolio: (id: string) => Promise<void>;
  createAccount: (input: NewAccountInput) => Promise<void>;
  archiveAccount: (id: string) => Promise<void>;
  createTransaction: (input: NewTransactionInput) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  generateDueRecurring: () => Promise<void>;
}

export const repositoryContractNotes = {
  purpose:
    "Feature UI should depend on this repository shape when moving from local Zustand to Supabase.",
  destructiveActions:
    "Delete operations should remain soft-delete by default and require UI confirmation before calling repository methods.",
  aiBoundary:
    "Assistant and parser services should consume summaries or action IDs, not unrestricted user prompts.",
} as const;
