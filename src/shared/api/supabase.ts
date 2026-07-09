import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const enableSupabase = import.meta.env.VITE_ENABLE_SUPABASE === "true";

export const isSupabaseConfigured = Boolean(enableSupabase && supabaseUrl && supabaseAnonKey);

let supabasePromise: Promise<SupabaseClient | null> | null = null;

export function getSupabaseClient() {
  if (!isSupabaseConfigured) return Promise.resolve(null);

  supabasePromise ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(supabaseUrl!, supabaseAnonKey!),
  );

  return supabasePromise;
}
