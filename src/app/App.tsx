import { lazy, Suspense } from "react";
import { AuthGate } from "../features/auth/AuthGate";
import { I18nProvider } from "../shared/i18n/i18n";
import { AppErrorBoundary } from "./AppErrorBoundary";

const AuthenticatedApp = lazy(() => import("./AuthenticatedApp").then(({ AuthenticatedApp }) => ({ default: AuthenticatedApp })));

export function App() {
  return (
    <I18nProvider>
      <AppErrorBoundary>
        <AuthGate>
          <Suspense fallback={<div className="auth-screen"><div className="auth-loader" /></div>}>
            <AuthenticatedApp />
          </Suspense>
        </AuthGate>
      </AppErrorBoundary>
    </I18nProvider>
  );
}
