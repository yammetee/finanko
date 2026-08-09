import { lazy, Suspense } from "react";
import { AuthGate } from "../features/auth/AuthGate";
import { I18nProvider } from "../shared/i18n/i18n";

let authenticatedAppPromise: ReturnType<typeof loadAuthenticatedAppModule> | null = null;

function loadAuthenticatedAppModule() {
  return import("./AuthenticatedApp").then(({ AuthenticatedApp }) => ({ default: AuthenticatedApp }));
}

function loadAuthenticatedApp() {
  authenticatedAppPromise ??= loadAuthenticatedAppModule();
  return authenticatedAppPromise;
}

function preloadAuthenticatedApp() {
  void loadAuthenticatedApp();
}

const AuthenticatedApp = lazy(loadAuthenticatedApp);

export function App() {
  return (
    <I18nProvider>
      <AuthGate preloadAuthenticatedApp={preloadAuthenticatedApp}>
        <Suspense fallback={<div className="auth-screen"><div className="auth-loader" /></div>}>
          <AuthenticatedApp />
        </Suspense>
      </AuthGate>
    </I18nProvider>
  );
}
