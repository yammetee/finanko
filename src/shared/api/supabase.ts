import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
const supabasePublishableKey = import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as
  | string
  | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

let supabasePromise: Promise<SupabaseClient | null> | null = null;

export function getSupabaseClient() {
  if (!isSupabaseConfigured) return Promise.resolve(null);

  supabasePromise ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(supabaseUrl!, supabasePublishableKey!),
  );

  return supabasePromise;
}
