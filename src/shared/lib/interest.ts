import dayjs from "dayjs";
import type { Account } from "../types/finance";

export function applyAccountInterest(
  amount: number,
  account: Account,
  date = dayjs(),
) {
  if (!account.annualInterestRate || !account.interestFrequency) return amount;

  const startedAt = account.interestStartedAt ? dayjs(account.interestStartedAt) : dayjs();
  if (!startedAt.isValid() || !date.isAfter(startedAt)) return amount;

  const annualRate = account.annualInterestRate / 100;

  if (account.interestFrequency === "daily") {
    const days = date.startOf("day").diff(startedAt.startOf("day"), "day");
    return amount * (1 + annualRate / 365) ** Math.max(days, 0);
  }

  const months = date.startOf("month").diff(startedAt.startOf("month"), "month");
  return amount * (1 + annualRate / 12) ** Math.max(months, 0);
}

export function getAccountInterestGain(amount: number, account: Account, date = dayjs()) {
  return applyAccountInterest(amount, account, date) - amount;
}
