import { describe, expect, it } from "vitest";
import type { Account, Category, Transaction, TransactionItem } from "../../shared/types/finance";
import { buildLedgerAnalytics } from "./analytics";
import { getLedgerAccountBalance } from "./balances";
import { financeStateToLedgerSnapshot } from "./financeLedgerAdapter";

const portfolioId = "portfolio-test";
const accounts: Account[] = [
  {
    id: "acc-bank",
    portfolioId,
    name: "Bank",
    type: "bank",
    currency: "USD",
    initialBalance: 1000,
    color: "#fff",
  },
  {
    id: "acc-savings",
    portfolioId,
    name: "Savings",
    type: "savings",
    currency: "USD",
    initialBalance: 0,
    color: "#fff",
  },
  {
    id: "acc-credit",
    portfolioId,
    name: "Credit",
    type: "credit",
    currency: "USD",
    initialBalance: -500,
    color: "#fff",
  },
  {
    id: "acc-extra",
    portfolioId,
    name: "Extra bank",
    type: "bank",
    currency: "USD",
    initialBalance: 0,
    color: "#fff",
  },
];
const categories: Category[] = [
  { id: "cat-interest", portfolioId, name: "Interest", type: "expense", color: "#fff" },
  { id: "cat-interest-income", portfolioId, name: "Interest income", type: "income", color: "#fff" },
  { id: "cat-food", portfolioId, name: "Food", type: "expense", color: "#fff" },
  { id: "cat-home", portfolioId, name: "Home", type: "expense", color: "#fff" },
];

describe("finance ledger adapter", () => {
  it("maps explicit asset interest accrual as income", () => {
    const transactions: Transaction[] = [
      {
        id: "tx-interest",
        portfolioId,
        accountId: "acc-savings",
        linkedAccountId: "acc-savings",
        type: "interest_accrual",
        amount: 10,
        currency: "USD",
        categoryId: "cat-interest-income",
        description: "Interest income",
        occurredAt: "2026-07-01T00:00:00.000Z",
        source: "system",
      },
    ];
    const snapshot = financeStateToLedgerSnapshot({ accounts, categories, transactions });
    const savings = snapshot.accounts.find((account) => account.id === "acc-savings")!;
    const analytics = buildLedgerAnalytics(snapshot.accounts, categories, snapshot.entries, "all", "USD");

    expect(getLedgerAccountBalance(savings, snapshot.entries)).toBe(10);
    expect(analytics.income).toBe(10);
  });

  it("converts transaction currency before applying it to account balance", () => {
    const transactions: Transaction[] = [
      {
        id: "tx-thb-expense",
        portfolioId,
        accountId: "acc-bank",
        type: "expense",
        amount: 500,
        currency: "THB",
        categoryId: "cat-food",
        description: "Breakfast and lunch",
        occurredAt: "2026-07-09T00:00:00.000Z",
        source: "text_ai",
      },
    ];
    const snapshot = financeStateToLedgerSnapshot({
      accounts: [{ ...accounts[0], initialBalance: 100, currency: "USD" }],
      categories,
      transactions,
    });
    const bank = snapshot.accounts.find((account) => account.id === "acc-bank")!;

    expect(getLedgerAccountBalance(bank, snapshot.entries)).toBeCloseTo(86.38, 2);
  });

  it("maps stored debt payment principal separately from interest expense", () => {
    const transactions: Transaction[] = [
      {
        id: "tx-debt-payment",
        portfolioId,
        accountId: "acc-bank",
        linkedAccountId: "acc-credit",
        type: "debt_payment",
        amount: 120,
        principalAmount: 100,
        interestAmount: 20,
        currency: "USD",
        categoryId: "cat-interest",
        description: "Credit payment",
        occurredAt: "2026-07-01T00:00:00.000Z",
        source: "manual",
      },
    ];
    const snapshot = financeStateToLedgerSnapshot({ accounts, categories, transactions });
    const analytics = buildLedgerAnalytics(snapshot.accounts, categories, snapshot.entries, "all", "USD");

    expect(analytics.expenses).toBe(20);
    expect(analytics.netWorth).toBe(480);
  });

  it("tracks multiple debt principal payments and reports debt total as an absolute liability", () => {
    const transactions: Transaction[] = [
      {
        id: "tx-payment-1",
        portfolioId,
        accountId: "acc-bank",
        linkedAccountId: "acc-credit",
        type: "debt_payment",
        amount: 120,
        principalAmount: 100,
        interestAmount: 20,
        currency: "USD",
        categoryId: "cat-interest",
        description: "Credit payment 1",
        occurredAt: "2026-07-01T00:00:00.000Z",
        source: "manual",
      },
      {
        id: "tx-payment-2",
        portfolioId,
        accountId: "acc-bank",
        linkedAccountId: "acc-credit",
        type: "debt_payment",
        amount: 50,
        principalAmount: 50,
        interestAmount: 0,
        currency: "USD",
        categoryId: "cat-interest",
        description: "Credit payment 2",
        occurredAt: "2026-07-02T00:00:00.000Z",
        source: "manual",
      },
    ];
    const snapshot = financeStateToLedgerSnapshot({ accounts, categories, transactions });
    const credit = snapshot.accounts.find((account) => account.id === "acc-credit")!;
    const analytics = buildLedgerAnalytics(snapshot.accounts, categories, snapshot.entries, "all", "USD");

    expect(getLedgerAccountBalance(credit, snapshot.entries)).toBe(-350);
    expect(analytics.debtTotal).toBe(350);
    expect(analytics.expenses).toBe(20);
  });

  it("uses transaction items for expense category analytics when present", () => {
    const transactions: Transaction[] = [
      {
        id: "tx-receipt",
        portfolioId,
        accountId: "acc-bank",
        type: "expense",
        amount: 100,
        currency: "USD",
        categoryId: "cat-food",
        description: "Mixed receipt",
        occurredAt: "2026-07-01T00:00:00.000Z",
        source: "manual",
      },
    ];
    const transactionItems: TransactionItem[] = [
      {
        id: "item-food",
        transactionId: "tx-receipt",
        name: "Groceries",
        amount: 40,
        categoryId: "cat-food",
        confidence: 1,
      },
      {
        id: "item-home",
        transactionId: "tx-receipt",
        name: "Household",
        amount: 60,
        categoryId: "cat-home",
        confidence: 1,
      },
    ];
    const snapshot = financeStateToLedgerSnapshot({
      accounts,
      categories,
      transactions,
      transactionItems,
    });
    const analytics = buildLedgerAnalytics(snapshot.accounts, categories, snapshot.entries, "all", "USD");

    expect(analytics.expenses).toBe(100);
    expect(analytics.byCategory).toEqual([
      { id: "cat-food", name: "Food", value: 40, fill: "#fff" },
      { id: "cat-home", name: "Home", value: 60, fill: "#fff" },
    ]);
  });

  it("handles negative receipt item discounts as contra-expense postings", () => {
    const transactions: Transaction[] = [
      {
        id: "tx-receipt-discount",
        portfolioId,
        accountId: "acc-bank",
        type: "expense",
        amount: 357,
        currency: "THB",
        categoryId: "cat-food",
        description: "7-Eleven",
        occurredAt: "2026-07-09T00:00:00.000Z",
        source: "receipt_ai",
      },
    ];
    const transactionItems: TransactionItem[] = [
      {
        id: "item-subtotal",
        transactionId: "tx-receipt-discount",
        name: "Items",
        amount: 366,
        categoryId: "cat-food",
        confidence: 0.8,
      },
      {
        id: "item-discount",
        transactionId: "tx-receipt-discount",
        name: "All Cafe",
        amount: -9,
        categoryId: "cat-food",
        confidence: 0.7,
      },
    ];
    const snapshot = financeStateToLedgerSnapshot({
      accounts,
      categories,
      transactions,
      transactionItems,
    });
    const analytics = buildLedgerAnalytics(snapshot.accounts, categories, snapshot.entries, "all", "THB");

    expect(analytics.expenses).toBe(357);
    expect(analytics.byCategory).toEqual([
      { id: "cat-food", name: "Food", value: 357, fill: "#fff" },
    ]);
  });
});
