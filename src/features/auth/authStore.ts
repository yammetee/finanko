import type { Session, User } from "@supabase/supabase-js";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getSupabaseClient, isSupabaseConfigured } from "../../shared/api/supabase";

interface DemoUser {
  id: string;
  email: string;
  name: string;
}

interface LocalAccountInput {
  email: string;
  name: string;
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  demoUser: DemoUser | null;
  localAccounts: DemoUser[];
  initialize: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  createLocalAccount: (input: LocalAccountInput) => void;
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
      localAccounts: [],
      initialize: async () => {
        if (!isSupabaseConfigured) {
          set({ loading: false });
          return;
        }

        const supabase = await getSupabaseClient();
        if (!supabase) {
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
        const supabase = await getSupabaseClient();
        if (!supabase) return;

        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: window.location.origin,
          },
        });
      },
      createLocalAccount: (input) => {
        const user = {
          id: `local-${crypto.randomUUID()}`,
          email: input.email,
          name: input.name,
        };
        set((state) => ({
          loading: false,
          demoUser: user,
          localAccounts: [...state.localAccounts, user],
        }));
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
        const supabase = await getSupabaseClient();
        if (supabase) {
          await supabase.auth.signOut();
        }
        set({ session: null, demoUser: null, loading: false });
      },
      user: () => get().session?.user ?? get().demoUser,
    }),
    {
      name: "finanko-auth-v1",
      partialize: (state) => ({
        demoUser: state.demoUser,
        localAccounts: state.localAccounts,
      }),
    },
  ),
);
