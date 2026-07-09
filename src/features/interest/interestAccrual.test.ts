import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import type { Account, Category, Transaction } from "../../shared/types/finance";
import {
  getDueInterestAccrualTransactions,
  MVP_INTEREST_DAY_COUNT,
} from "./interestAccrual";

const portfolioId = "portfolio-test";
const categories: Category[] = [
  {
    id: "cat-interest-income",
    portfolioId,
    name: "Interest income",
    type: "income",
    color: "#fff",
  },
  {
    id: "cat-interest-expense",
    portfolioId,
    name: "Interest expense",
    type: "expense",
    color: "#fff",
  },
];

const savings: Account = {
  id: "acc-savings",
  portfolioId,
  name: "Savings",
  type: "savings",
  currency: "USD",
  initialBalance: 1200,
  color: "#fff",
  annualInterestRate: 12,
  interestFrequency: "monthly",
  interestStartedAt: "2026-01-01T00:00:00.000Z",
};

const credit: Account = {
  id: "acc-credit",
  portfolioId,
  name: "Credit",
  type: "credit",
  currency: "USD",
  initialBalance: -3650,
  color: "#fff",
  annualInterestRate: 10,
  interestFrequency: "daily",
  interestStartedAt: "2026-01-01T00:00:00.000Z",
};

describe("interest accrual generation", () => {
  it("uses the MVP 365-day count policy for daily interest", () => {
    expect(MVP_INTEREST_DAY_COUNT).toBe(365);
  });

  it("creates monthly asset interest as explicit system transactions", () => {
    const transactions = getDueInterestAccrualTransactions({
      accounts: [savings],
      categories,
      transactions: [],
      portfolioId,
      date: dayjs("2026-03-15T00:00:00.000Z"),
      createId: () => "tx-interest",
    });

    expect(transactions.map((transaction) => transaction.amount)).toEqual([12, 12.12]);
    expect(transactions[0]).toMatchObject({
      type: "interest_accrual",
      source: "system",
      accountId: "acc-savings",
      linkedAccountId: "acc-savings",
      categoryId: "cat-interest-income",
    });
  });

  it("does not create duplicate interest for an existing period", () => {
    const existing: Transaction = {
      id: "tx-existing",
      portfolioId,
      accountId: "acc-savings",
      linkedAccountId: "acc-savings",
      type: "interest_accrual",
      amount: 12,
      currency: "USD",
      categoryId: "cat-interest-income",
      description: "Interest income",
      occurredAt: "2026-01-31T00:00:00.000Z",
      source: "system",
    };

    const transactions = getDueInterestAccrualTransactions({
      accounts: [savings],
      categories,
      transactions: [existing],
      portfolioId,
      date: dayjs("2026-03-15T00:00:00.000Z"),
      createId: () => "tx-interest",
    });

    expect(transactions).toHaveLength(1);
    expect(dayjs(transactions[0]?.occurredAt).format("YYYY-MM")).toBe("2026-02");
  });

  it("creates daily liability interest as expense", () => {
    const transactions = getDueInterestAccrualTransactions({
      accounts: [credit],
      categories,
      transactions: [],
      portfolioId,
      date: dayjs("2026-01-03T00:00:00.000Z"),
      createId: () => "tx-interest",
    });

    expect(transactions.map((transaction) => transaction.amount)).toEqual([1, 1]);
    expect(transactions[0]).toMatchObject({
      accountId: "acc-credit",
      linkedAccountId: "acc-credit",
      categoryId: "cat-interest-expense",
    });
  });

  it("does not accrue interest on a zero balance", () => {
    const zeroSavings: Account = {
      ...savings,
      initialBalance: 0,
    };

    const transactions = getDueInterestAccrualTransactions({
      accounts: [zeroSavings],
      categories,
      transactions: [],
      portfolioId,
      date: dayjs("2026-03-15T00:00:00.000Z"),
      createId: () => "tx-interest",
    });

    expect(transactions).toHaveLength(0);
  });

  it("uses the reduced liability balance after a partial principal payment", () => {
    const transactions = getDueInterestAccrualTransactions({
      accounts: [credit],
      categories,
      transactions: [
        {
          id: "tx-payment",
          portfolioId,
          accountId: "acc-bank",
          linkedAccountId: "acc-credit",
          type: "debt_payment",
          amount: 3650,
          principalAmount: 3650,
          interestAmount: 0,
          currency: "USD",
          categoryId: "cat-interest-expense",
          description: "Principal payment",
          occurredAt: "2026-01-01T12:00:00.000Z",
          source: "manual",
        },
      ],
      portfolioId,
      date: dayjs("2026-01-03T00:00:00.000Z"),
      createId: () => "tx-interest",
    });

    expect(transactions).toHaveLength(0);
  });
});
