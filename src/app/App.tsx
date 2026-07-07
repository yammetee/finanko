import { AppThemeProvider } from "./providers/AppThemeProvider";
import { AuthGate } from "../features/auth/AuthGate";
import { FinanceDashboard } from "../features/dashboard/FinanceDashboard";
import { I18nProvider } from "../shared/i18n/i18n";

export function App() {
  return (
    <AppThemeProvider>
      <I18nProvider>
        <AuthGate>
          <FinanceDashboard />
        </AuthGate>
      </I18nProvider>
    </AppThemeProvider>
  );
}
