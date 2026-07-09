import { LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "../../shared/i18n/i18nContext";
import { isSupabaseConfigured } from "../../shared/api/supabase";
import { switchFinanceStorageScope } from "../finance/financeStore";
import { useAuthStore } from "./authStore";

interface AuthGateProps {
  children: React.ReactNode;
}

type AuthUser = ReturnType<ReturnType<typeof useAuthStore.getState>["user"]>;

function getUserFinanceName(user: AuthUser) {
  if (!user) return "Personal";
  if ("name" in user && user.name) return user.name;
  return user.email ?? "Personal";
}

export function AuthGate({ children }: AuthGateProps) {
  const { createLocalAccount, initialize, signInWithGoogle, loading, user } =
    useAuthStore();
  const { t } = useI18n();
  const currentUser = user();
  const currentUserId = currentUser?.id;
  const currentUserFinanceName = getUserFinanceName(currentUser);
  const [financeReady, setFinanceReady] = useState(false);
  const [localAccount, setLocalAccount] = useState({
    email: "",
    name: "",
  });

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    let active = true;

    if (!currentUserId) {
      setFinanceReady(false);
      return () => {
        active = false;
      };
    }

    setFinanceReady(false);
    void switchFinanceStorageScope(currentUserId, currentUserFinanceName).then(() => {
      if (active) setFinanceReady(true);
    });

    return () => {
      active = false;
    };
  }, [currentUserFinanceName, currentUserId]);

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
            <p className="muted auth-description">{t("auth.envHint")}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
