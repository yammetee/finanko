import { createClient } from "@supabase/supabase-js";

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

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authenticatedUserId(supabaseUrl: string, publishableKey: string, token: string) {
  try {
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: publishableKey, authorization: `Bearer ${token}` },
    });
    if (!authResponse.ok) return null;
    const user = await authResponse.json() as { id?: unknown };
    return typeof user.id === "string" && USER_ID_PATTERN.test(user.id) ? user.id : null;
  } catch {
    return null;
  }
}

export async function handler(request: ApiRequest, response: ApiResponse) {
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

  const userId = await authenticatedUserId(supabaseUrl, publishableKey, token);
  if (!userId) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await admin.auth.admin.deleteUser(userId, false);
  if (error) {
    response.status(500).json({ error: "Account deletion failed" });
    return;
  }

  response.status(204).end();
}

async function fetchHandler(request: Request) {
  let status = 200;
  let responseBody: unknown;
  const headers = new Headers();
  const adapter: ApiResponse = {
    status(code) { status = code; return adapter; },
    json(payload) { responseBody = payload; },
    setHeader(name, value) { headers.set(name, value); },
    end() {},
  };
  await handler({
    method: request.method,
    headers: { authorization: request.headers.get("authorization") ?? undefined },
  }, adapter);
  if (responseBody === undefined) return new Response(null, { status, headers });
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(responseBody), { status, headers });
}

export default { fetch: fetchHandler };
