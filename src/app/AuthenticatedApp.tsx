import { AppThemeProvider } from "./providers/AppThemeProvider";
import { ExpensesPage } from "../features/expenses/ExpensesPage";

export function AuthenticatedApp() {
  return (
    <AppThemeProvider>
      <ExpensesPage />
    </AppThemeProvider>
  );
}
