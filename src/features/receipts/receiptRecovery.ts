export interface RecoverableReceiptRow {
  rowType: "product" | "discount" | "subtotal" | "tax" | "total" | "payment" | "change" | "header" | "other";
  amount: number | null;
}

export interface RecoverableReceiptOcr {
  rows: RecoverableReceiptRow[];
  totals: {
    subtotal: number | null;
    discount: number | null;
    tax: number | null;
    total: number | null;
  };
}

function positiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function deriveReceiptTotal(ocr: RecoverableReceiptOcr) {
  if (positiveNumber(ocr.totals.total)) return roundMoney(ocr.totals.total);

  const explicitTotal = [...ocr.rows]
    .reverse()
    .find((row) => row.rowType === "total" && positiveNumber(row.amount))?.amount;
  if (positiveNumber(explicitTotal)) return roundMoney(explicitTotal);

  if (positiveNumber(ocr.totals.subtotal)) {
    const calculated = ocr.totals.subtotal
      - Math.abs(ocr.totals.discount ?? 0)
      + (ocr.totals.tax ?? 0);
    if (positiveNumber(calculated)) return roundMoney(calculated);
  }

  const itemTotal = ocr.rows.reduce((sum, row) => {
    if (!positiveNumber(row.amount)) return sum;
    if (row.rowType === "product") return sum + row.amount;
    if (row.rowType === "discount") return sum - Math.abs(row.amount);
    if (row.rowType === "tax") return sum + row.amount;
    return sum;
  }, 0);
  return positiveNumber(itemTotal) ? roundMoney(itemTotal) : null;
}
