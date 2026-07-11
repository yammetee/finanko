import { describe, expect, it } from "vitest";
import { moneyFromDecimal, minorToDecimal } from "./money";
import { buildLedgerAnalytics } from "./analytics";
import { getLedgerAccountBalance } from "./balances";
import { buildLedgerEntry } from "./postings";
import type { LedgerAccount, LedgerEntry } from "./ledgerTypes";
import { financeStateToLedgerSnapshot } from "./financeLedgerAdapter";

const portfolioId = "portfolio-test";
const bank: LedgerAccount = {
  id: "acc-bank",
  portfolioId,
  name: "Bank",
  type: "bank",
  currency: "USD",
  openingBalanceMinor: 0,
};
const credit: LedgerAccount = {
  id: "acc-credit",
  portfolioId,
  name: "Credit",
  type: "credit",
  currency: "USD",
  openingBalanceMinor: -100_000,
};
const categories = [
  { id: "cat-salary", portfolioId, type: "income" as const, name: "Salary", color: "#5fd38a" },
  { id: "cat-food", portfolioId, type: "expense" as const, name: "Food", color: "#e8b94c" },
  { id: "cat-interest", portfolioId, type: "expense" as const, name: "Interest", color: "#f07f86" },
];

function incomeEntry(amountMinor: number): LedgerEntry {
  return buildLedgerEntry({
    id: "entry-income",
    portfolioId,
    kind: "income",
    occurredAt: "2026-07-01T00:00:00.000Z",
    description: "Salary",
    postings: [
      { accountId: bank.id, amountMinor, currency: "USD", direction: "increase", role: "cash" },
      { categoryId: "cat-salary", amountMinor, currency: "USD", direction: "increase", role: "income" },
    ],
  });
}

function expenseEntry(amountMinor: number): LedgerEntry {
  return buildLedgerEntry({
    id: "entry-expense",
    portfolioId,
    kind: "expense",
    occurredAt: "2026-07-02T00:00:00.000Z",
    description: "Groceries",
    postings: [
      { accountId: bank.id, amountMinor, currency: "USD", direction: "decrease", role: "cash" },
      { categoryId: "cat-food", amountMinor, currency: "USD", direction: "increase", role: "expense" },
    ],
  });
}

describe("ledger money", () => {
  it("stores money in minor units", () => {
    expect(moneyFromDecimal(10.23, "USD")).toEqual({ amountMinor: 1023, currency: "USD" });
    expect(minorToDecimal(1023, "USD")).toBe(10.23);
  });

  it("rejects non-finite money", () => {
    expect(() => moneyFromDecimal(Number.NaN, "USD")).toThrow("finite");
  });

  it("rejects money with too many fractional digits", () => {
    expect(() => moneyFromDecimal(10.123, "USD")).toThrow("fractional");
  });
});

describe("ledger balances and analytics", () => {
  it("income increases asset balance, income, and net worth", () => {
    const entries = [incomeEntry(400_000)];
    const analytics = buildLedgerAnalytics([bank], categories, entries, "all", "USD");

    expect(getLedgerAccountBalance(bank, entries)).toBe(4000);
    expect(analytics.income).toBe(4000);
    expect(analytics.expenses).toBe(0);
    expect(analytics.netWorth).toBe(4000);
  });

  it("expense decreases asset balance and net worth", () => {
    const entries = [incomeEntry(400_000), expenseEntry(5_000)];
    const analytics = buildLedgerAnalytics([bank], categories, entries, "all", "USD");

    expect(getLedgerAccountBalance(bank, entries)).toBe(3950);
    expect(analytics.expenses).toBe(50);
    expect(analytics.netWorth).toBe(3950);
  });

  it("debt principal payment reduces debt but is not an expense", () => {
    const entries = [
      incomeEntry(400_000),
      buildLedgerEntry({
        id: "entry-debt-payment",
        portfolioId,
        kind: "debt_payment",
        occurredAt: "2026-07-04T00:00:00.000Z",
        description: "Credit payment",
        postings: [
          { accountId: bank.id, amountMinor: 10_000, currency: "USD", direction: "decrease", role: "cash" },
          {
            accountId: credit.id,
            amountMinor: 10_000,
            currency: "USD",
            direction: "increase",
            role: "liability_principal",
          },
        ],
      }),
    ];
    const analytics = buildLedgerAnalytics([bank, credit], categories, entries, "all", "USD");

    expect(getLedgerAccountBalance(credit, entries)).toBe(-900);
    expect(analytics.expenses).toBe(0);
    expect(analytics.netWorth).toBe(3000);
  });

  it("debt interest accrual increases debt and expenses", () => {
    const entries = [
      buildLedgerEntry({
        id: "entry-interest",
        portfolioId,
        kind: "interest_accrual",
        occurredAt: "2026-07-05T00:00:00.000Z",
        description: "Credit interest",
        postings: [
          {
            accountId: credit.id,
            amountMinor: 1_500,
            currency: "USD",
            direction: "decrease",
            role: "liability_interest",
          },
          { categoryId: "cat-interest", amountMinor: 1_500, currency: "USD", direction: "increase", role: "expense" },
        ],
      }),
    ];
    const analytics = buildLedgerAnalytics([credit], categories, entries, "all", "USD");

    expect(getLedgerAccountBalance(credit, entries)).toBe(-1015);
    expect(analytics.expenses).toBe(15);
    expect(analytics.netWorth).toBe(-1015);
  });

  it("infers liability interest direction even when category metadata is unavailable", () => {
    const snapshot = financeStateToLedgerSnapshot({
      accounts: [{ id: credit.id, portfolioId, name: credit.name, type: credit.type, currency: "USD", initialBalance: -1000, color: "#fff" }],
      categories: [],
      transactions: [{
        id: "entry-interest-without-category", portfolioId, accountId: credit.id, linkedAccountId: credit.id,
        type: "interest_accrual", amount: 15, currency: "USD", categoryId: "cat-interest",
        occurredAt: "2026-07-05T00:00:00.000Z", description: "Credit interest", source: "system",
      }],
    });
    expect(getLedgerAccountBalance(snapshot.accounts[0], snapshot.entries)).toBe(-1015);
  });
});
