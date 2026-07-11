import type { Session, User } from "@supabase/supabase-js";
import { create } from "zustand";
import { getSupabaseClient, isSupabaseConfigured } from "../../shared/api/supabase";

let unsubscribeAuth: (() => void) | null = null;

interface AuthState {
  loading: boolean;
  session: Session | null;
  initialize: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string, legalAcceptedAt: string) => Promise<void>;
  signOut: () => Promise<void>;
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

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  },
  signUpWithPassword: async (email, password, legalAcceptedAt) => {
    const supabase = await getSupabaseClient();
    if (!supabase) return;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          terms_accepted_at: legalAcceptedAt,
          terms_version: "2026-07-11",
          privacy_acknowledged_at: legalAcceptedAt,
          privacy_version: "2026-07-11",
        },
      },
    });
    if (error) throw error;
  },
  signOut: async () => {
    const supabase = await getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    set({ session: null, loading: false });
  },
  user: () => get().session?.user ?? null,
}));
