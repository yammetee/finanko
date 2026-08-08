import { LogOut } from "lucide-react";
import { useI18n } from "../shared/i18n/i18nContext";
import { useAuthStore } from "../features/auth/authStore";

export type AppPage = "expenses" | "capital" | "debts";
interface Props { page: AppPage; onPageChange: (page: AppPage) => void }

export function AppHeader({ page, onPageChange }: Props) {
  const { t } = useI18n();
  const signOut = useAuthStore((state) => state.signOut);
  return <header className="app-header">
    <button aria-label="evenkvit" className="brand" type="button" onClick={() => onPageChange("expenses")}><img alt="" src="/evenkvit-mark.png" /></button>
    <nav className="header-tabs" aria-label="Разделы">
      <button aria-current={page === "expenses" ? "page" : undefined} className={page === "expenses" ? "active" : ""} type="button" onClick={() => onPageChange("expenses")}>{t("expense.history")}</button>
      <button aria-current={page === "capital" ? "page" : undefined} className={page === "capital" ? "active" : ""} type="button" onClick={() => onPageChange("capital")}>{t("capital.title")}</button>
      <button aria-current={page === "debts" ? "page" : undefined} className={page === "debts" ? "active" : ""} type="button" onClick={() => onPageChange("debts")}>{t("debt.title")}</button>
    </nav>
    <div className="header-actions"><button type="button" aria-label={t("actions.signOut")} onClick={() => void signOut()}><LogOut size={17} /></button></div>
  </header>;
}
