import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { getDueRecurringTransactions } from "./recurring";
import type { RecurringRule, Transaction } from "../../shared/types/finance";

const rule: RecurringRule = {
  id: "rec-rent",
  portfolioId: "portfolio-test",
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

describe("recurring generation", () => {
  it("generates all missed months up to the requested date", () => {
    let id = 0;
    const transactions = getDueRecurringTransactions({
      rules: [rule],
      transactions: [],
      portfolioId: "portfolio-test",
      date: dayjs("2026-03-10T00:00:00.000Z"),
      createId: () => `tx-${id += 1}`,
    });

    expect(transactions).toHaveLength(3);
    expect(transactions.map((transaction) => dayjs(transaction.occurredAt).format("YYYY-MM-DD"))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });

  it("does not generate duplicates for existing non-deleted months", () => {
    const existing: Transaction = {
      id: "tx-existing",
      portfolioId: "portfolio-test",
      accountId: "acc-bank",
      type: "expense",
      amount: 1200,
      currency: "USD",
      categoryId: "cat-home",
      description: "Rent",
      occurredAt: "2026-02-28T00:00:00.000Z",
      source: "recurring",
      recurringRuleId: "rec-rent",
    };

    const transactions = getDueRecurringTransactions({
      rules: [rule],
      transactions: [existing],
      portfolioId: "portfolio-test",
      date: dayjs("2026-03-10T00:00:00.000Z"),
      createId: () => "tx-new",
    });

    expect(transactions.map((transaction) => dayjs(transaction.occurredAt).format("YYYY-MM"))).toEqual([
      "2026-01",
      "2026-03",
    ]);
  });

  it("does not regenerate a deleted recurring transaction for the same month", () => {
    const deleted: Transaction = {
      id: "tx-deleted",
      portfolioId: "portfolio-test",
      accountId: "acc-bank",
      type: "expense",
      amount: 1200,
      currency: "USD",
      categoryId: "cat-home",
      description: "Rent",
      occurredAt: "2026-01-31T00:00:00.000Z",
      source: "recurring",
      recurringRuleId: "rec-rent",
      deletedAt: "2026-02-01T00:00:00.000Z",
    };

    const transactions = getDueRecurringTransactions({
      rules: [{ ...rule, endsAt: "2026-01-31T23:59:59.999Z" }],
      transactions: [deleted],
      portfolioId: "portfolio-test",
      date: dayjs("2026-03-10T00:00:00.000Z"),
      createId: () => "tx-new",
    });

    expect(transactions).toHaveLength(0);
  });
});
