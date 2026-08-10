import { GoTrueClient } from "@supabase/auth-js";
import { PostgrestClient } from "@supabase/postgrest-js";
import { fetchWithTimeout } from "./fetchWithTimeout";

const supabaseUrl = import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
const supabasePublishableKey = import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as
  | string
  | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

type AppSupabaseClient = PostgrestClient & { auth: GoTrueClient };

let authClientPromise: Promise<GoTrueClient | null> | null = null;
let dataClientPromise: Promise<AppSupabaseClient | null> | null = null;

function supabaseEndpoint(path: string) {
  return `${supabaseUrl!.replace(/\/+$/, "")}/${path}`;
}

function authStorageKey() {
  const hostname = new URL(supabaseUrl!).hostname;
  return `sb-${hostname.split(".")[0]}-auth-token`;
}

export function getSupabaseAuthClient() {
  if (!isSupabaseConfigured) return Promise.resolve(null);

  authClientPromise ??= Promise.resolve(
    new GoTrueClient({
      url: supabaseEndpoint("auth/v1"),
      headers: {
        Authorization: `Bearer ${supabasePublishableKey!}`,
        apikey: supabasePublishableKey!,
      },
      storageKey: authStorageKey(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      fetch: fetchWithTimeout,
    }),
  );

  return authClientPromise;
}

async function getSupabaseDataClient() {
  if (!isSupabaseConfigured) return null;

  dataClientPromise ??= getSupabaseAuthClient().then((auth) => {
    if (!auth) return null;

    const authenticatedFetch: typeof fetch = async (input, init) => {
      const { data } = await auth.getSession();
      const accessToken = data.session?.access_token ?? supabasePublishableKey!;
      const headers = new Headers(init?.headers);
      if (!headers.has("apikey")) headers.set("apikey", supabasePublishableKey!);
      if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${accessToken}`);
      return fetchWithTimeout(input, { ...init, headers });
    };

    const dataClient = new PostgrestClient(supabaseEndpoint("rest/v1"), {
      schema: "public",
      fetch: authenticatedFetch,
    });

    return Object.assign(dataClient, { auth });
  });

  return dataClientPromise;
}

export async function requireSupabaseClient() {
  const client = await getSupabaseDataClient();
  if (!client) throw new Error("Supabase is not configured");
  return client;
}
