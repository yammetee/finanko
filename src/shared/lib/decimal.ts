const SCALE_DIGITS = 18;
const SCALE = 10n ** BigInt(SCALE_DIGITS);

export type Decimal = bigint;

export function decimal(value: string | number | undefined): Decimal {
  if (value === undefined || value === "") return 0n;
  const text = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new Error(`Invalid decimal: ${text}`);
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = unsigned.split(".");
  const scaled = BigInt(whole) * SCALE + BigInt((fraction + "0".repeat(SCALE_DIGITS)).slice(0, SCALE_DIGITS));
  return negative ? -scaled : scaled;
}

export function multiply(left: Decimal, right: Decimal): Decimal {
  return left * right / SCALE;
}

export function divide(left: Decimal, right: Decimal): Decimal {
  if (right === 0n) return 0n;
  return left * SCALE / right;
}

export function roundDecimal(value: Decimal, fractionDigits = 2): Decimal {
  if (!Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > SCALE_DIGITS) throw new Error("Invalid decimal precision");
  const step = 10n ** BigInt(SCALE_DIGITS - fractionDigits);
  const absolute = value < 0n ? -value : value;
  const rounded = (absolute + step / 2n) / step * step;
  return value < 0n ? -rounded : rounded;
}

export function decimalString(value: Decimal): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE).toString().padStart(SCALE_DIGITS, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
