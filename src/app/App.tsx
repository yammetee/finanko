import { lazy, Suspense } from "react";
import { AuthGate } from "../features/auth/AuthGate";
import { I18nProvider } from "../shared/i18n/i18n";
import { loadAuthenticatedApp } from "./authenticatedAppModule";

const AuthenticatedApp = lazy(() => loadAuthenticatedApp().then(({ AuthenticatedApp }) => ({ default: AuthenticatedApp })));

export function App() {
  return (
    <I18nProvider>
      <AuthGate>
        <Suspense fallback={<div className="auth-screen"><div className="auth-loader" /></div>}>
          <AuthenticatedApp />
        </Suspense>
      </AuthGate>
    </I18nProvider>
  );
}
