import type { Currency } from "../../shared/types/finance";
import { convertMoney } from "../../shared/lib/currency";
import { getCurrencyFractionDigits, minorToDecimal } from "./money";
import type { LedgerAccount, LedgerEntry } from "./ledgerTypes";
import { getPostingDelta } from "./postings";

export function getLedgerAccountBalanceMinor(account: LedgerAccount, entries: LedgerEntry[]) {
  return entries.reduce((balance, entry) => {
    if (entry.deletedAt) return balance;

    const entryDelta = entry.postings
      .filter((posting) => posting.accountId === account.id)
      .reduce((sum, posting) => {
        const deltaMinor = getPostingDelta(posting);
        const delta = minorToDecimal(deltaMinor, posting.currency);
        const accountCurrencyDelta =
          posting.currency === account.currency
            ? delta
            : convertMoney(delta, posting.currency, account.currency, entry.occurredAt);
        const factor = 10 ** getCurrencyFractionDigits(account.currency);
        return sum + Math.round(accountCurrencyDelta * factor);
      }, 0);

    return balance + entryDelta;
  }, account.openingBalanceMinor);
}

export function getLedgerAccountBalance(account: LedgerAccount, entries: LedgerEntry[]) {
  return minorToDecimal(getLedgerAccountBalanceMinor(account, entries), account.currency);
}

export function getLedgerAccountBalanceInCurrency(
  account: LedgerAccount,
  entries: LedgerEntry[],
  currency: Currency,
  date?: string,
) {
  const balance = getLedgerAccountBalance(account, entries);
  return convertMoney(balance, account.currency, currency, date);
}
