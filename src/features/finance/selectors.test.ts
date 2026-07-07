import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import {
  buildAnalytics,
  filterPeriodTransactions,
  getAccountBalance,
} from "./selectors";
import type { Account, Category, Transaction } from "../../shared/types/finance";

const accounts: Account[] = [
  {
    id: "acc-usd",
    portfolioId: "p1",
    name: "USD",
    type: "bank",
    currency: "USD",
    initialBalance: 100,
    color: "#fff",
  },
  {
    id: "acc-rub",
    portfolioId: "p1",
    name: "RUB debt",
    type: "debt",
    currency: "RUB",
    initialBalance: -900000,
    color: "#fff",
  },
];

const categories: Category[] = [
  {
    id: "cat-salary",
    portfolioId: "p1",
    name: "Salary",
    type: "income",
    color: "#86efac",
  },
  {
    id: "cat-food",
    portfolioId: "p1",
    name: "Food",
    type: "expense",
    color: "#fca5a5",
  },
];

function tx(input: Partial<Transaction>): Transaction {
  return {
    id: input.id ?? "tx",
    portfolioId: "p1",
    accountId: input.accountId ?? "acc-usd",
    type: input.type ?? "expense",
    amount: input.amount ?? 1,
    currency: input.currency ?? "USD",
    categoryId: input.categoryId ?? "cat-food",
    description: input.description ?? "",
    occurredAt: input.occurredAt ?? dayjs().toISOString(),
    source: input.source ?? "manual",
  };
}

describe("finance selectors", () => {
  it("filters all-time transactions without date boundaries", () => {
    const transactions = [
      tx({ id: "old", occurredAt: dayjs().subtract(3, "year").toISOString() }),
      tx({ id: "now", occurredAt: dayjs().toISOString() }),
    ];

    expect(filterPeriodTransactions(transactions, "all")).toHaveLength(2);
  });

  it("calculates account balance from transaction history", () => {
    const balance = getAccountBalance(accounts[0], [
      tx({ type: "income", amount: 200 }),
      tx({ type: "expense", amount: 50 }),
    ]);

    expect(balance).toBe(250);
  });

  it("does not mix non-base currencies into total balance", () => {
    const analytics = buildAnalytics(
      accounts,
      categories,
      [
        tx({ type: "income", amount: 4000, currency: "USD" }),
        tx({
          accountId: "acc-rub",
          type: "expense",
          amount: 900000,
          currency: "RUB",
        }),
      ],
      "all",
      "USD",
    );

    expect(analytics.totalBalance).toBe(4100);
  });

  it("builds fixed rolling chart buckets for week, month, and year", () => {
    const transactions = [
      tx({ type: "expense", amount: 10, occurredAt: dayjs().toISOString() }),
    ];

    expect(buildAnalytics(accounts, categories, transactions, "week", "USD").trend).toHaveLength(7);
    expect(buildAnalytics(accounts, categories, transactions, "month", "USD").trend).toHaveLength(30);
    expect(buildAnalytics(accounts, categories, transactions, "year", "USD").trend).toHaveLength(12);
  });

  it("keeps at least seven all-time chart buckets", () => {
    const analytics = buildAnalytics(
      accounts,
      categories,
      [tx({ type: "expense", amount: 10, occurredAt: dayjs().toISOString() })],
      "all",
      "USD",
    );

    expect(analytics.trend).toHaveLength(7);
    expect(analytics.netWorthTrend).toHaveLength(7);
  });
});
