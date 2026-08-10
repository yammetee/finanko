import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "../../shared/i18n/i18nContext";
import { isSupabaseConfigured } from "../../shared/api/supabase";
import { initializeExpenseData, resetExpenseData } from "../expenses/expenseStore";
import { getAuthErrorKey } from "./authErrors";
import { useAuthStore } from "./authStore";
import { loadAuthenticatedApp } from "../../app/authenticatedAppModule";
import { loadTrendChart } from "../../shared/ui/trendChartModule";

interface AuthGateProps { children: React.ReactNode }

export function AuthGate({ children }: AuthGateProps) {
  const { initialize, signInWithPassword, signUpWithPassword, loading, session } = useAuthStore(useShallow((state) => ({
    initialize: state.initialize,
    signInWithPassword: state.signInWithPassword,
    signUpWithPassword: state.signUpWithPassword,
    loading: state.loading,
    session: state.session,
  })));
  const { t } = useI18n();
  const currentUser = session?.user ?? null;
  const currentUserId = typeof currentUser?.id === "string" ? currentUser.id : null;
  const [authMode, setAuthMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (typeof currentUserId !== "string") {
      resetExpenseData();
      return;
    }

    void loadAuthenticatedApp();
    void loadTrendChart();
    void initializeExpenseData(currentUserId).catch(() => undefined);
  }, [currentUserId]);

  if (loading) {
    return (
      <div className="auth-screen">
        <div className="auth-loader" />
      </div>
    );
  }

  if (currentUser) {
    return children;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError(null);
    setAuthNotice(null);

    if (authMode === "signUp" && !legalAccepted) {
      setAuthError(t("auth.acceptLegalError"));
      return;
    }

    setSubmitting(true);

    try {
      if (authMode === "signIn") {
        await signInWithPassword(email.trim(), password);
      } else {
        const result = await signUpWithPassword(email.trim(), password, new Date().toISOString());
        if (result.requiresEmailConfirmation) {
          setAuthMode("signIn");
          setPassword("");
          setAuthNotice(t("auth.signUpCheckEmail"));
        }
      }
    } catch (error) {
      setAuthError(t(getAuthErrorKey(error)));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-stack">
          <div className="auth-brand">
            <img alt="evenkvit" height={123} src="/evenkvit-mark.webp" width={224} />
            <p className="muted auth-description">{t("auth.description")}</p>
          </div>
          <form className="auth-local-form" onSubmit={handleSubmit}>
            <input
              aria-label={t("auth.emailPlaceholder")}
              autoComplete="email"
              className="auth-input"
              disabled={!isSupabaseConfigured || submitting}
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("auth.emailPlaceholder")}
              required
              type="email"
              value={email}
            />
            <div className="auth-password-field">
              <input
                aria-label={t("auth.passwordPlaceholder")}
                autoComplete={authMode === "signIn" ? "current-password" : "new-password"}
                className="auth-input"
                disabled={!isSupabaseConfigured || submitting}
                minLength={6}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t("auth.passwordPlaceholder")}
                required
                type={passwordVisible ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={t(passwordVisible ? "auth.hidePassword" : "auth.showPassword")}
                aria-pressed={passwordVisible}
                disabled={!isSupabaseConfigured || submitting}
                onClick={() => setPasswordVisible((visible) => !visible)}
                title={t(passwordVisible ? "auth.hidePassword" : "auth.showPassword")}
                type="button"
              >
                {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {authMode === "signUp" ? (
              <label className="auth-legal-consent">
                <input checked={legalAccepted} onChange={(event) => setLegalAccepted(event.target.checked)} type="checkbox" />
                <span>{t("auth.acceptLegalPrefix")} <a href="/terms.html" target="_blank">{t("legal.terms")}</a> {t("auth.acceptLegalAnd")} <a href="/privacy.html" target="_blank">{t("legal.privacy")}</a>.</span>
              </label>
            ) : null}
            <button
              className="auth-action auth-action-primary"
              disabled={!isSupabaseConfigured || submitting}
              type="submit"
            >
              {authMode === "signIn" ? <LogIn size={18} /> : <UserPlus size={18} />}
              {authMode === "signIn" ? t("actions.signIn") : t("actions.signUp")}
            </button>
          </form>
          <button
            className="auth-action"
            disabled={submitting}
            type="button"
            onClick={() => {
              setAuthError(null);
              setAuthNotice(null);
              setAuthMode((mode) => (mode === "signIn" ? "signUp" : "signIn"));
            }}
          >
            {authMode === "signIn" ? t("auth.needAccount") : t("auth.haveAccount")}
          </button>
          {authError ? <p className="muted auth-description">{authError}</p> : null}
          {authNotice ? <p className="muted auth-description">{authNotice}</p> : null}
          {!isSupabaseConfigured ? (
            <p className="muted auth-description">{t("auth.envHint")}</p>
          ) : null}
          <div className="legal-links"><a href="/privacy.html" target="_blank">{t("legal.privacy")}</a><a href="/terms.html" target="_blank">{t("legal.terms")}</a></div>
        </div>
      </div>
    </div>
  );
}
