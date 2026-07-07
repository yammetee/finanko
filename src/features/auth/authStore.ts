import type { Session, User } from "@supabase/supabase-js";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isSupabaseConfigured, supabase } from "../../shared/api/supabase";

interface DemoUser {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  demoUser: DemoUser | null;
  initialize: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInDemo: () => void;
  signOut: () => Promise<void>;
  user: () => User | DemoUser | null;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      loading: true,
      session: null,
      demoUser: null,
      initialize: async () => {
        if (!isSupabaseConfigured || !supabase) {
          set({ loading: false });
          return;
        }

        const { data } = await supabase.auth.getSession();
        set({ session: data.session, loading: false });

        supabase.auth.onAuthStateChange((_event, session) => {
          set({ session, loading: false, demoUser: null });
        });
      },
      signInWithGoogle: async () => {
        if (!supabase) return;

        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: window.location.origin,
          },
        });
      },
      signInDemo: () =>
        set({
          loading: false,
          demoUser: {
            id: "demo-user",
            email: "demo@finanko.app",
            name: "Demo User",
          },
        }),
      signOut: async () => {
        if (supabase) {
          await supabase.auth.signOut();
        }
        set({ session: null, demoUser: null, loading: false });
      },
      user: () => get().session?.user ?? get().demoUser,
    }),
    {
      name: "finanko-auth-v1",
      partialize: (state) => ({ demoUser: state.demoUser }),
    },
  ),
);
