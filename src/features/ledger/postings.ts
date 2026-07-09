import type { Currency, TransactionSource } from "../../shared/types/finance";
import type { LedgerEntry, LedgerEntryKind, Posting, PostingRole } from "./ledgerTypes";

function postingDelta(posting: Pick<Posting, "amountMinor" | "direction">) {
  return posting.direction === "increase" ? posting.amountMinor : -posting.amountMinor;
}

export function getPostingDelta(posting: Pick<Posting, "amountMinor" | "direction">) {
  return postingDelta(posting);
}

function makePosting(input: Omit<Posting, "id" | "entryId">, entryId: string, index: number): Posting {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < 0) {
    throw new Error("Posting amountMinor must be a non-negative integer");
  }

  if (!input.accountId && !input.categoryId) {
    throw new Error("Posting must target an account or category");
  }

  return {
    ...input,
    id: `${entryId}-posting-${index}`,
    entryId,
  };
}

export function buildLedgerEntry(input: {
  id: string;
  portfolioId: string;
  kind: LedgerEntryKind;
  occurredAt: string;
  description: string;
  source?: TransactionSource | "system";
  deletedAt?: string;
  postings: Array<Omit<Posting, "id" | "entryId">>;
}): LedgerEntry {
  const postings = input.postings.map((posting, index) => makePosting(posting, input.id, index));
  validateLedgerEntry({ kind: input.kind, postings });

  return {
    id: input.id,
    portfolioId: input.portfolioId,
    kind: input.kind,
    occurredAt: input.occurredAt,
    description: input.description,
    source: input.source ?? "manual",
    deletedAt: input.deletedAt,
    postings,
  };
}

export function buildAccountOnlyEntry(input: {
  id: string;
  portfolioId: string;
  kind: LedgerEntryKind;
  accountId: string;
  amountMinor: number;
  currency: Currency;
  direction: "increase" | "decrease";
  occurredAt: string;
  description: string;
  source?: TransactionSource | "system";
  deletedAt?: string;
  role?: PostingRole;
}) {
  return buildLedgerEntry({
    id: input.id,
    portfolioId: input.portfolioId,
    kind: input.kind,
    occurredAt: input.occurredAt,
    description: input.description,
    source: input.source,
    deletedAt: input.deletedAt,
    postings: [
      {
        accountId: input.accountId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        direction: input.direction,
        role: input.role ?? "cash",
      },
    ],
  });
}

export function validateLedgerEntry(entry: Pick<LedgerEntry, "kind" | "postings">) {
  if (entry.postings.length === 0) {
    throw new Error("Ledger entry must have postings");
  }

  if (entry.kind === "debt_payment") {
    const hasPrincipal = entry.postings.some((posting) => posting.role === "liability_principal");
    if (!hasPrincipal) {
      throw new Error("Debt payment must include principal posting");
    }
  }
}
