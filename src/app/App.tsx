import { lazy, Suspense } from "react";
import { AuthGate } from "../features/auth/AuthGate";
import { I18nProvider } from "../shared/i18n/i18n";

const AuthenticatedApp = lazy(() =>
  import("./AuthenticatedApp").then((module) => ({ default: module.AuthenticatedApp })),
);

export function App() {
  return (
    <I18nProvider>
      <AuthGate>
        <Suspense fallback={<div className="auth-screen" />}>
          <AuthenticatedApp />
        </Suspense>
      </AuthGate>
    </I18nProvider>
  );
}
