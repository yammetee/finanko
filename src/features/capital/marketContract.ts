const MARKET_SYMBOL_PATTERN = /^[A-Z0-9._-]{1,32}$/;

export function normalizeMarketSymbol(value: unknown) {
  if (typeof value !== "string") return undefined;
  const symbol = value.trim().toUpperCase();
  return MARKET_SYMBOL_PATTERN.test(symbol) ? symbol : undefined;
}

export function isMarketSymbol(value: unknown): value is string {
  return normalizeMarketSymbol(value) !== undefined;
}
