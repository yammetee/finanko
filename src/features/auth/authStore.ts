import type { Session, User } from "@supabase/supabase-js";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getSupabaseClient, isSupabaseConfigured } from "../../shared/api/supabase";

interface LocalUser {
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
  localUser: LocalUser | null;
  localAccounts: LocalUser[];
  initialize: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  createLocalAccount: (input: LocalAccountInput) => void;
  signOut: () => Promise<void>;
  user: () => User | LocalUser | null;
}

function localUserIdForEmail(email: string) {
  return `local:${email.trim().toLowerCase()}`;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      loading: true,
      session: null,
      localUser: null,
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
          set({ session, loading: false, localUser: null });
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
          id: localUserIdForEmail(input.email),
          email: input.email,
          name: input.name,
        };
        set((state) => ({
          loading: false,
          localUser: user,
          localAccounts: [...state.localAccounts, user],
        }));
      },
      signOut: async () => {
        const supabase = await getSupabaseClient();
        if (supabase) {
          await supabase.auth.signOut();
        }
        set({ session: null, localUser: null, loading: false });
      },
      user: () => get().session?.user ?? get().localUser,
    }),
    {
      name: "finanko-auth-v1",
      version: 3,
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== "object") return persistedState;
        const state = persistedState as Partial<AuthState>;
        const localUser = state.localUser?.email
          ? { ...state.localUser, id: localUserIdForEmail(state.localUser.email) }
          : state.localUser;
        const localAccounts = state.localAccounts?.map((account) => ({
          ...account,
          id: localUserIdForEmail(account.email),
        }));

        return {
          ...state,
          localUser,
          localAccounts,
        };
      },
      partialize: (state) => ({
        localUser: state.localUser,
        localAccounts: state.localAccounts,
      }),
    },
  ),
);
