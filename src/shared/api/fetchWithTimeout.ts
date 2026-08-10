const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: RequestInit = {},
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const sourceSignal = init.signal;
  const abortFromSource = () => controller.abort();
  if (sourceSignal?.aborted) controller.abort();
  else sourceSignal?.addEventListener("abort", abortFromSource, { once: true });
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeoutId);
    sourceSignal?.removeEventListener("abort", abortFromSource);
  }
}
