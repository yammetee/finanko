import type { User } from "@supabase/supabase-js";
import { LogIn, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "../../shared/i18n/i18nContext";
import { isSupabaseConfigured } from "../../shared/api/supabase";
import { initializeFinanceData } from "../finance/financeStore";
import { useAuthStore } from "./authStore";

interface AuthGateProps {
  children: React.ReactNode;
}

function getUserFinanceName(user: User | null): string {
  if (!user) return "Personal";
  const userName = user.user_metadata?.name;
  if (typeof userName === "string" && userName.trim()) return userName;
  return user.email ?? "Personal";
}

export function AuthGate({ children }: AuthGateProps) {
  const { initialize, signInWithPassword, signUpWithPassword, loading, user } = useAuthStore();
  const { t } = useI18n();
  const currentUser = user();
  const currentUserId = typeof currentUser?.id === "string" ? currentUser.id : null;
  const currentUserFinanceName = getUserFinanceName(currentUser);
  const [financeReady, setFinanceReady] = useState(false);
  const [financeError, setFinanceError] = useState<string | null>(null);
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
      setFinanceReady(false);
      return () => {
        active = false;
      };
    }

    setFinanceReady(false);
    setFinanceError(null);
    void initializeFinanceData(currentUserId, currentUserFinanceName)
      .then(() => { if (active) setFinanceReady(true); })
      .catch((error) => { if (active) setFinanceError(error instanceof Error ? error.message : "Finance data could not be loaded"); });

    return () => {
      active = false;
    };
  }, [currentUserFinanceName, currentUserId]);

  if (currentUser && financeError) {
    return <div className="auth-screen"><div className="auth-card"><p className="muted auth-description">{financeError}</p><button className="auth-action auth-action-primary" type="button" onClick={() => window.location.reload()}>{t("actions.retry")}</button></div></div>;
  }

  if (loading || (currentUser && !financeReady)) {
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
    setSubmitting(true);

    try {
      if (authMode === "signIn") {
        await signInWithPassword(email.trim(), password);
      } else {
        if (!legalAccepted) throw new Error(t("auth.acceptLegalError"));
        await signUpWithPassword(email.trim(), password, new Date().toISOString());
        setAuthNotice(t("auth.signUpCheckEmail"));
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : t("auth.authFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-stack">
          <div>
            <span className="brand-mark">F</span>
            <h1 className="auth-title">Finanko</h1>
            <p className="muted auth-description">{t("auth.description")}</p>
          </div>
          <form className="auth-local-form" onSubmit={handleSubmit}>
            <input
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
