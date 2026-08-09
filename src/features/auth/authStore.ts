import type { Session, User } from "@supabase/supabase-js";
import { create } from "zustand";
import { getSupabaseClient, isSupabaseConfigured } from "../../shared/api/supabase";

let unsubscribeAuth: (() => void) | null = null;

interface SignUpResult {
  requiresEmailConfirmation: boolean;
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  initialize: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string, legalAcceptedAt: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  user: () => User | null;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  loading: true,
  session: null,
  initialize: async () => {
    if (!isSupabaseConfigured) {
      set({ loading: false, session: null });
      return;
    }

    const supabase = await getSupabaseClient();
    if (!supabase) {
      set({ loading: false, session: null });
      return;
    }

    const { data } = await supabase.auth.getSession();
    set({ session: data.session, loading: false });

    unsubscribeAuth?.();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, loading: false });
    });
    unsubscribeAuth = () => listener.subscription.unsubscribe();
  },
  signInWithPassword: async (email, password) => {
    const supabase = await getSupabaseClient();
    if (!supabase) return;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    set({ session: data.session, loading: false });
  },
  signUpWithPassword: async (email, password, legalAcceptedAt) => {
    const supabase = await getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          terms_accepted_at: legalAcceptedAt,
          terms_version: "2026-08-09",
          privacy_acknowledged_at: legalAcceptedAt,
          privacy_version: "2026-08-09",
        },
      },
    });
    if (error) throw error;

    if (data.session) {
      set({ session: data.session, loading: false });
    }

    return { requiresEmailConfirmation: !data.session };
  },
  signOut: async () => {
    const supabase = await getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    set({ session: null, loading: false });
  },
  deleteAccount: async () => {
    const supabase = await getSupabaseClient();
    const session = get().session;
    if (!supabase || !session) throw new Error("Authentication required");

    const response = await fetch("/api/account", {
      method: "DELETE",
      headers: { authorization: `Bearer ${session.access_token}` },
    });
    if (!response.ok) throw new Error("Account deletion failed");

    await supabase.auth.signOut({ scope: "local" });
    set({ session: null, loading: false });
  },
  user: () => get().session?.user ?? null,
}));
