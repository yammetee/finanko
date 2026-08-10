import { fetchWithTimeout } from "../shared/api/fetchWithTimeout";

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
