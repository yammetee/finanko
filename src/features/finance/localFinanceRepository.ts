import { createSeedSnapshot } from "./seedData";
import type { FinanceRepository } from "./financeRepository";

export const localFinanceRepository: FinanceRepository = {
  getSnapshot: async () => createSeedSnapshot(),
  createPortfolio: async () => undefined,
  deletePortfolio: async () => undefined,
  createAccount: async () => undefined,
  archiveAccount: async () => undefined,
  createTransaction: async () => undefined,
  deleteTransaction: async () => undefined,
  generateDueRecurring: async () => undefined,
};

export const localRepositoryNotes = {
  purpose:
    "MVP uses local JSON seed data plus persisted client state. This adapter mirrors the future database boundary.",
  replacement:
    "Supabase can replace this repository without changing feature UI contracts.",
} as const;
