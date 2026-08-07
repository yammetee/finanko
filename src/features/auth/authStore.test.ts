import type { Session } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("../../shared/api/supabase", () => ({
  getSupabaseClient: vi.fn(async () => ({ auth })),
  isSupabaseConfigured: true,
}));

import { useAuthStore } from "./authStore";

const session = {
  access_token: "access-token",
  refresh_token: "refresh-token",
  expires_in: 3600,
  token_type: "bearer",
  user: { id: "user-id" },
} as unknown as Session;

describe("authentication store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", { location: { origin: "https://finanko.test" } });
    useAuthStore.setState({ loading: false, session: null });
  });

  it("stores the session returned by sign-up for immediate access", async () => {
    auth.signUp.mockResolvedValueOnce({ data: { session }, error: null });

    const result = await useAuthStore.getState().signUpWithPassword(
      "person@example.com",
      "secure-password",
      "2026-08-07T12:00:00.000Z",
    );

    expect(result).toEqual({ requiresEmailConfirmation: false });
    expect(useAuthStore.getState().session).toBe(session);
    expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: "person@example.com",
      options: expect.objectContaining({ emailRedirectTo: "https://finanko.test" }),
    }));
  });

  it("reports when Supabase requires email confirmation before issuing a session", async () => {
    auth.signUp.mockResolvedValueOnce({ data: { session: null }, error: null });

    const result = await useAuthStore.getState().signUpWithPassword(
      "person@example.com",
      "secure-password",
      "2026-08-07T12:00:00.000Z",
    );

    expect(result).toEqual({ requiresEmailConfirmation: true });
    expect(useAuthStore.getState().session).toBeNull();
  });
});
