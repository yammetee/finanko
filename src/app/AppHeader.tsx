import { CircleUserRound } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useI18n } from "../shared/i18n/i18nContext";

const AppAccountMenu = lazy(() => import("./AppAccountMenu").then((module) => ({ default: module.AppAccountMenu })));

export type AppPage = "expenses" | "capital" | "debts";
interface Props { page: AppPage; onPageChange: (page: AppPage) => void }

function AccountMenuLauncher() {
  const { t } = useI18n();
  const [requested, setRequested] = useState(false);
  const button = <button type="button" aria-label={t("actions.account")} title={t("actions.account")} onClick={() => setRequested(true)}><CircleUserRound size={18} /></button>;
  if (!requested) return button;
  return <Suspense fallback={button}><AppAccountMenu /></Suspense>;
}

export function AppHeader({ page, onPageChange }: Props) {
  const { t } = useI18n();
  return <header className="app-header">
    <button aria-label="evenkvit" className="brand" type="button" onClick={() => onPageChange("expenses")}><img alt="" height={123} src="/evenkvit-mark.webp" width={224} /></button>
    <nav className="header-tabs" aria-label="Разделы">
      <button aria-current={page === "expenses" ? "page" : undefined} className={page === "expenses" ? "active" : ""} type="button" onClick={() => onPageChange("expenses")}>{t("expense.history")}</button>
      <button aria-current={page === "capital" ? "page" : undefined} className={page === "capital" ? "active" : ""} type="button" onClick={() => onPageChange("capital")}>{t("capital.title")}</button>
      <button aria-current={page === "debts" ? "page" : undefined} className={page === "debts" ? "active" : ""} type="button" onClick={() => onPageChange("debts")}>{t("debt.title")}</button>
    </nav>
    <div className="header-actions">
      <AccountMenuLauncher />
    </div>
  </header>;
}
