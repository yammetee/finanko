import { GoTrueAdminApi } from "@supabase/auth-js";
import { fetchWithTimeout } from "../src/shared/api/fetchWithTimeout";
import { getAuthenticatedUserId } from "../src/server/supabaseAuth";

interface ApiRequest {
  method?: string;
  headers: { authorization?: string };
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(payload: unknown): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

export async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Allow", "DELETE");
  if (request.method !== "DELETE") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!token || !supabaseUrl || !publishableKey) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!secretKey) {
    response.status(503).json({ error: "Account deletion is not configured" });
    return;
  }

  const userId = await getAuthenticatedUserId(supabaseUrl, publishableKey, token);
  if (!userId) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const admin = new GoTrueAdminApi({
    url: `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      apikey: secretKey,
    },
    fetch: fetchWithTimeout,
  });
  const { error } = await admin.deleteUser(userId, false);
  if (error) {
    response.status(500).json({ error: "Account deletion failed" });
    return;
  }

  response.status(204).end();
}

export default handler;
