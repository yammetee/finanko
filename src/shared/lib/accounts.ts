import type { Account, AccountType } from "../types/finance";

const LIABILITY_ACCOUNT_TYPES = new Set<AccountType>(["debt", "credit", "mortgage"]);
const INTEREST_ACCOUNT_TYPES = new Set<AccountType>([
  "savings",
  "investment",
  "debt",
  "credit",
  "mortgage",
]);

export function isLiabilityAccountType(type: AccountType) {
  return LIABILITY_ACCOUNT_TYPES.has(type);
}

export function supportsInterestAccountType(type: AccountType) {
  return INTEREST_ACCOUNT_TYPES.has(type);
}

export function isLiabilityAccount(account: Account) {
  return isLiabilityAccountType(account.type);
}

export function normalizeAccountInitialBalance(
  type: AccountType,
  initialBalance: number,
) {
  const amount = Number(initialBalance) || 0;
  return isLiabilityAccountType(type) ? -Math.abs(amount) : amount;
}
