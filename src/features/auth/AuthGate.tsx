import { LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "../../shared/i18n/i18nContext";
import { isSupabaseConfigured } from "../../shared/api/supabase";
import { useAuthStore } from "./authStore";

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const { createLocalAccount, initialize, signInDemo, signInWithGoogle, loading, user } =
    useAuthStore();
  const { t } = useI18n();
  const currentUser = user();
  const [localAccount, setLocalAccount] = useState({
    email: "demo@finanko.app",
    name: "Demo User",
  });

  useEffect(() => {
    initialize();
  }, [initialize]);

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

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-stack">
          <div>
            <span className="brand-mark">F</span>
            <h1 className="auth-title">Finanko</h1>
            <p className="muted auth-description">{t("auth.description")}</p>
          </div>
          <button
            className="auth-action auth-action-primary"
            disabled={!isSupabaseConfigured}
            type="button"
            onClick={signInWithGoogle}
          >
            <LogIn size={18} />
            {t("actions.continueGoogle")}
          </button>
          {!isSupabaseConfigured ? (
            <form
              className="auth-local-form"
              onSubmit={(event) => {
                event.preventDefault();
                createLocalAccount(localAccount);
              }}
            >
              <input
                className="auth-input"
                required
                value={localAccount.name}
                placeholder={t("form.name")}
                onChange={(event) =>
                  setLocalAccount((value) => ({ ...value, name: event.target.value }))
                }
              />
              <input
                className="auth-input"
                required
                type="email"
                value={localAccount.email}
                placeholder={t("form.email")}
                onChange={(event) =>
                  setLocalAccount((value) => ({ ...value, email: event.target.value }))
                }
              />
              <button className="auth-action auth-action-primary" type="submit">
                {t("actions.createLocalAccount")}
              </button>
            </form>
          ) : null}
          {!isSupabaseConfigured ? (
            <button className="auth-action" type="button" onClick={signInDemo}>
              {t("actions.continueDemo")}
            </button>
          ) : null}
          {!isSupabaseConfigured ? (
            <p className="muted auth-description">{t("auth.envHint")}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
