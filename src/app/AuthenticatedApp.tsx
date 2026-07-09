import { AppThemeProvider } from "./providers/AppThemeProvider";
import { FinanceDashboard } from "../features/dashboard/FinanceDashboard";

export function AuthenticatedApp() {
  return (
    <AppThemeProvider>
      <FinanceDashboard />
    </AppThemeProvider>
  );
}
