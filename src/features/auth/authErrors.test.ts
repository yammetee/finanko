import { describe, expect, it } from "vitest";
import { getAuthErrorKey } from "./authErrors";

describe("authentication error localization", () => {
  it("maps stable Supabase error codes to user-facing messages", () => {
    expect(getAuthErrorKey({ code: "invalid_credentials", message: "raw provider error" }))
      .toBe("auth.invalidCredentials");
    expect(getAuthErrorKey({ code: "email_not_confirmed" }))
      .toBe("auth.emailNotConfirmed");
    expect(getAuthErrorKey({ code: "weak_password" }))
      .toBe("auth.weakPassword");
  });

  it("handles rate limits and hides unknown provider messages", () => {
    expect(getAuthErrorKey({ status: 429, message: "provider-specific text" }))
      .toBe("auth.tooManyRequests");
    expect(getAuthErrorKey(new Error("raw provider error")))
      .toBe("auth.authFailed");
  });
});
