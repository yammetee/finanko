import { AppThemeProvider } from "./providers/AppThemeProvider";
import { ExpenseDashboard } from "../features/expenses/ExpenseDashboard";

export function AuthenticatedApp() {
  return (
    <AppThemeProvider>
      <ExpenseDashboard />
    </AppThemeProvider>
  );
}
