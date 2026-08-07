import { LogIn, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "../../shared/i18n/i18nContext";
import { isSupabaseConfigured } from "../../shared/api/supabase";
import { initializeExpenseData } from "../expenses/expenseStore";
import { getAuthErrorKey } from "./authErrors";
import { useAuthStore } from "./authStore";

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const { initialize, signInWithPassword, signUpWithPassword, loading, user } = useAuthStore();
  const { t } = useI18n();
  const currentUser = user();
  const currentUserId = typeof currentUser?.id === "string" ? currentUser.id : null;
  const [expensesReady, setExpensesReady] = useState(false);
  const [expensesError, setExpensesError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    void initializeExpenseData(currentUserId)
      .then(() => { if (active) setExpensesReady(true); })
      .catch(() => { if (active) setExpensesError(t("feedback.loadFailed")); });

    return () => {
      active = false;
    };
  }, [currentUserId, t]);

  if (currentUser && expensesError) {
    return <div className="auth-screen"><div className="auth-card"><p className="muted auth-description">{expensesError}</p><button className="auth-action auth-action-primary" type="button" onClick={() => window.location.reload()}>{t("actions.retry")}</button></div></div>;
  }

  if (loading || (currentUser && !expensesReady)) {
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
          <div>
            <span>F</span>
            <h1 className="auth-title">Finanko</h1>
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
            <input
              aria-label={t("auth.passwordPlaceholder")}
              autoComplete={authMode === "signIn" ? "current-password" : "new-password"}
              className="auth-input"
              disabled={!isSupabaseConfigured || submitting}
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("auth.passwordPlaceholder")}
              required
              type="password"
              value={password}
            />
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
