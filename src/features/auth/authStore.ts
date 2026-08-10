import type { Session } from "@supabase/auth-js";
import { create } from "zustand";
import { getSupabaseAuthClient, isSupabaseConfigured } from "../../shared/api/supabase";

let unsubscribeAuth: (() => void) | null = null;
let initializeAuthPromise: Promise<void> | null = null;

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
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  loading: true,
  session: null,
  initialize: () => {
    if (unsubscribeAuth) return Promise.resolve();
    if (initializeAuthPromise) return initializeAuthPromise;

    initializeAuthPromise = (async () => {
      if (!isSupabaseConfigured) {
        set({ loading: false, session: null });
        return;
      }

      const auth = await getSupabaseAuthClient();
      if (!auth) {
        set({ loading: false, session: null });
        return;
      }

      const { data: listener } = auth.onAuthStateChange((_event, session) => {
        set({ session, loading: false });
      });
      unsubscribeAuth = () => listener.subscription.unsubscribe();
    })().catch((error) => {
      initializeAuthPromise = null;
      set({ loading: false, session: null });
      throw error;
    });

    return initializeAuthPromise;
  },
  signInWithPassword: async (email, password) => {
    const auth = await getSupabaseAuthClient();
    if (!auth) return;

    const { error } = await auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  },
  signUpWithPassword: async (email, password, legalAcceptedAt) => {
    const auth = await getSupabaseAuthClient();
    if (!auth) throw new Error("Supabase is not configured");

    const { data, error } = await auth.signUp({
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

    return { requiresEmailConfirmation: !data.session };
  },
  signOut: async () => {
    const auth = await getSupabaseAuthClient();
    if (auth) {
      await auth.signOut();
    }
  },
  deleteAccount: async () => {
    const auth = await getSupabaseAuthClient();
    const session = get().session;
    if (!auth || !session) throw new Error("Authentication required");

    const response = await fetch("/api/account", {
      method: "DELETE",
      headers: { authorization: `Bearer ${session.access_token}` },
    });
    if (!response.ok) throw new Error("Account deletion failed");

    await auth.signOut({ scope: "local" });
  },
}));
