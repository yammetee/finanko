const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    return await fetch(input, { ...init, cache: "no-store", signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeoutId);
    sourceSignal?.removeEventListener("abort", abortFromSource);
  }
}

export async function getAuthenticatedUserId(supabaseUrl: string, publishableKey: string, token: string) {
  try {
    const response = await fetchWithTimeout(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`, {
      headers: { apikey: publishableKey, authorization: `Bearer ${token}` },
    }, 8_000);
    if (!response.ok) return null;
    const user = await response.json() as { id?: unknown };
    return typeof user.id === "string" && USER_ID_PATTERN.test(user.id) ? user.id : null;
  } catch {
    return null;
  }
}
