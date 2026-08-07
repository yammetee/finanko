import type { MessageKey } from "../../shared/i18n/i18nContext";

const authErrorKeys: Partial<Record<string, MessageKey>> = {
  email_address_invalid: "auth.emailInvalid",
  email_address_not_authorized: "auth.emailNotAuthorized",
  email_exists: "auth.accountExists",
  email_not_confirmed: "auth.emailNotConfirmed",
  email_provider_disabled: "auth.emailProviderDisabled",
  invalid_credentials: "auth.invalidCredentials",
  over_email_send_rate_limit: "auth.tooManyRequests",
  over_request_rate_limit: "auth.tooManyRequests",
  request_timeout: "auth.requestTimeout",
  user_already_exists: "auth.accountExists",
  validation_failed: "auth.authFailed",
  weak_password: "auth.weakPassword",
};

export function getAuthErrorKey(error: unknown): MessageKey {
  if (!error || typeof error !== "object") return "auth.authFailed";

  const value = error as { code?: unknown; status?: unknown };
  if (value.status === 429) return "auth.tooManyRequests";
  if (typeof value.code !== "string") return "auth.authFailed";

  return authErrorKeys[value.code] ?? "auth.authFailed";
}
