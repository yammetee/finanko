import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "../../shared/i18n/i18nContext";
import { isSupabaseConfigured } from "../../shared/api/supabase";
import { initializeExpenseData } from "../expenses/expenseStore";
import { getAuthErrorKey } from "./authErrors";
import { useAuthStore } from "./authStore";

interface AuthGateProps {
  children: React.ReactNode;
  preloadAuthenticatedApp: () => void;
}

export function AuthGate({ children, preloadAuthenticatedApp }: AuthGateProps) {
  const { initialize, signInWithPassword, signUpWithPassword, loading, user } = useAuthStore();
  const { t } = useI18n();
  const currentUser = user();
  const currentUserId = typeof currentUser?.id === "string" ? currentUser.id : null;
  const [expensesReady, setExpensesReady] = useState(false);
  const [expensesError, setExpensesError] = useState<string | null>(null);
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
    let active = true;

    if (typeof currentUserId !== "string") {
      setExpensesReady(false);
      return () => {
        active = false;
      };
    }

    setExpensesReady(false);
    setExpensesError(null);
    preloadAuthenticatedApp();
    void initializeExpenseData(currentUserId)
      .then(() => { if (active) setExpensesReady(true); })
      .catch(() => { if (active) setExpensesError(t("feedback.loadFailed")); });

    return () => {
      active = false;
    };
  }, [currentUserId, preloadAuthenticatedApp, t]);

  if (currentUser && expensesError) {
    return <div className="auth-screen"><div className="auth-card"><p className="muted auth-description">{expensesError}</p><button className="auth-action auth-action-primary" type="button" onClick={() => window.location.reload()}>{t("actions.retry")}</button></div></div>;
  }

  if (loading) {
    return (
      <div className="auth-screen">
        <div className="auth-loader" />
      </div>
    );
  }

  if (currentUser && !expensesReady) {
    return (
      <div className="app-shell app-loading-shell" aria-busy="true">
        <header className="app-header">
          <span className="brand"><img alt="" height={123} src="/evenkvit-mark.webp" width={224} /></span>
          <nav className="header-tabs" aria-label="Разделы">
            <button className="active" disabled type="button">{t("expense.history")}</button>
            <button disabled type="button">{t("capital.title")}</button>
            <button disabled type="button">{t("debt.title")}</button>
          </nav>
          <div className="header-actions"><button aria-hidden="true" disabled tabIndex={-1} type="button" /></div>
        </header>
        <main className="main-content">
          <section className="summary-header">
            <div className="summary-copy"><span>{t("expense.spent")}</span><div className="summary-total"><strong>—</strong></div><small aria-hidden="true"><span className="loading-line loading-line-wide" /></small></div>
            <div className="quick-actions" aria-hidden="true"><span /><span /><span /></div>
          </section>
          <section className="filters" aria-hidden="true"><div className="loading-line" /><div className="loading-line loading-line-wide" /></section>
          <div className="app-loading-panel" aria-hidden="true"><div className="auth-loader" /></div>
        </main>
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
