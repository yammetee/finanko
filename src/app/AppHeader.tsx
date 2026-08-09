import AntApp from "antd/es/app";
import Dropdown from "antd/es/dropdown";
import { CircleUserRound, LogOut, UserX } from "lucide-react";
import { useI18n } from "../shared/i18n/i18nContext";
import { useAuthStore } from "../features/auth/authStore";

export type AppPage = "expenses" | "capital" | "debts";
interface Props { page: AppPage; onPageChange: (page: AppPage) => void }

export function AppHeader({ page, onPageChange }: Props) {
  const { message, modal } = AntApp.useApp();
  const { t } = useI18n();
  const email = useAuthStore((state) => state.session?.user.email);
  const signOut = useAuthStore((state) => state.signOut);
  const deleteAccount = useAuthStore((state) => state.deleteAccount);
  const confirmAccountDeletion = () => {
    modal.confirm({
      title: t("account.delete.title"),
      content: t("account.delete.description"),
      okText: t("account.delete.confirm"),
      cancelText: t("actions.cancel"),
      okButtonProps: { danger: true },
      async onOk() {
        try {
          await deleteAccount();
        } catch {
          message.error(t("account.delete.failed"));
          throw new Error("Account deletion failed");
        }
      },
    });
  };
  return <header className="app-header">
    <button aria-label="evenkvit" className="brand" type="button" onClick={() => onPageChange("expenses")}><img alt="" src="/evenkvit-mark.png" /></button>
    <nav className="header-tabs" aria-label="Разделы">
      <button aria-current={page === "expenses" ? "page" : undefined} className={page === "expenses" ? "active" : ""} type="button" onClick={() => onPageChange("expenses")}>{t("expense.history")}</button>
      <button aria-current={page === "capital" ? "page" : undefined} className={page === "capital" ? "active" : ""} type="button" onClick={() => onPageChange("capital")}>{t("capital.title")}</button>
      <button aria-current={page === "debts" ? "page" : undefined} className={page === "debts" ? "active" : ""} type="button" onClick={() => onPageChange("debts")}>{t("debt.title")}</button>
    </nav>
    <div className="header-actions">
      <Dropdown
        arrow
        menu={{
          items: [
            { key: "email", label: <span className="account-menu-email">{email}</span>, disabled: true },
            { type: "divider" },
            { key: "sign-out", label: t("actions.signOut"), icon: <LogOut size={16} /> },
            { type: "divider" },
            { key: "delete-account", label: t("actions.deleteAccount"), icon: <UserX size={16} />, danger: true },
          ],
          onClick: ({ key }) => {
            if (key === "sign-out") void signOut();
            if (key === "delete-account") confirmAccountDeletion();
          },
        }}
        placement="bottomRight"
        rootClassName="account-menu"
        trigger={["click"]}
      >
        <button type="button" aria-label={t("actions.account")} title={t("actions.account")}><CircleUserRound size={18} /></button>
      </Dropdown>
    </div>
  </header>;
}
