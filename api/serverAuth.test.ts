import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthenticatedUser } from "./serverAuth";

describe("server authentication", () => {
  afterEach(() => vi.restoreAllMocks());

  it("accepts only a token confirmed by Supabase Auth", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
    await expect(isAuthenticatedUser("https://project.supabase.co", "publishable", "jwt")).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith("https://project.supabase.co/auth/v1/user", { headers: { apikey: "publishable", authorization: "Bearer jwt" } });
  });

  it("rejects expired or invalid tokens without trusting their local payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 401 } as Response);
    await expect(isAuthenticatedUser("https://project.supabase.co", "publishable", "expired")).resolves.toBe(false);
  });
});
