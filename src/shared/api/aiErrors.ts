export class AiDailyLimitError extends Error {
  limit?: number;
  remaining?: number;
  resetDate?: string;

  constructor(payload?: { limit?: number; remaining?: number; resetDate?: string }) {
    super("AI daily limit reached");
    this.name = "AiDailyLimitError";
    this.limit = payload?.limit;
    this.remaining = payload?.remaining;
    this.resetDate = payload?.resetDate;
  }
}

export function isAiDailyLimitError(error: unknown): error is AiDailyLimitError {
  return error instanceof AiDailyLimitError;
}
