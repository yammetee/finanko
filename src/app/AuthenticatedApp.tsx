import { AppThemeProvider } from "./providers/AppThemeProvider";
import { ExpenseWorkspace } from "../features/expenses/ExpenseWorkspace";

export function AuthenticatedApp() {
  return (
    <AppThemeProvider>
      <ExpenseWorkspace />
    </AppThemeProvider>
  );
}
