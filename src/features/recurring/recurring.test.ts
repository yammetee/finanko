import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import {
  buildRecurringTransaction,
  getDueRecurringTransactions,
  hasGeneratedRecurringTransaction,
} from "./recurring";
import type { RecurringRule, Transaction } from "../../shared/types/finance";

const rule: RecurringRule = {
  id: "rec-rent",
  portfolioId: "p1",
  accountId: "acc-bank",
  type: "expense",
  amount: 1200,
  currency: "USD",
  categoryId: "cat-home",
  description: "Rent",
  dayOfMonth: 31,
  startsAt: "2026-01-01T00:00:00.000Z",
  isActive: true,
};

function tx(input: Partial<Transaction>): Transaction {
  return {
    id: input.id ?? "tx",
    portfolioId: "p1",
    accountId: "acc-bank",
    type: input.type ?? "expense",
    amount: input.amount ?? 1200,
    currency: input.currency ?? "USD",
    categoryId: input.categoryId ?? "cat-home",
    description: input.description ?? "Rent",
    occurredAt: input.occurredAt ?? "2026-02-28T00:00:00.000Z",
    source: input.source ?? "recurring",
    recurringRuleId: input.recurringRuleId ?? "rec-rent",
    deletedAt: input.deletedAt,
  };
}

describe("recurring", () => {
  it("clamps day of month to the current month length", () => {
    const transaction = buildRecurringTransaction({
      rule,
      date: dayjs("2026-02-10T00:00:00.000Z"),
      id: "tx-rec",
    });

    expect(dayjs(transaction.occurredAt).date()).toBe(28);
  });

  it("detects existing generated transactions for the same month", () => {
    expect(
      hasGeneratedRecurringTransaction(rule, [tx({})], dayjs("2026-02-01")),
    ).toBe(true);
  });

  it("does not count deleted generated transactions as existing", () => {
    expect(
      hasGeneratedRecurringTransaction(
        rule,
        [tx({ deletedAt: "2026-02-15T00:00:00.000Z" })],
        dayjs("2026-02-01"),
      ),
    ).toBe(false);
  });

  it("generates only active due rules for the active portfolio", () => {
    const additions = getDueRecurringTransactions({
      rules: [
        rule,
        { ...rule, id: "inactive", isActive: false },
        { ...rule, id: "other-portfolio", portfolioId: "p2" },
      ],
      transactions: [],
      portfolioId: "p1",
      date: dayjs("2026-03-01"),
      createId: () => "generated",
    });

    expect(additions).toHaveLength(1);
    expect(additions[0].id).toBe("generated");
  });
});
