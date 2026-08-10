import Dropdown from "antd/es/dropdown";
import useModal from "antd/es/modal/useModal";
import { CircleUserRound, LogOut, UserX } from "lucide-react";
import { useState } from "react";
import { useAuthStore } from "../features/auth/authStore";
import { useI18n } from "../shared/i18n/i18nContext";
import { useFeedback } from "../shared/ui/feedbackContext";
import { AppThemeProvider } from "./providers/AppThemeProvider";

export function AppAccountMenu({ onClose }: { onClose: () => void }) {
  return <AppThemeProvider><AppAccountMenuContent onClose={onClose} /></AppThemeProvider>;
}

function AppAccountMenuContent({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  const [modal, modalHolder] = useModal();
  const { message } = useFeedback();
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
      afterClose: onClose,
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

  return (
    <>
      {modalHolder}
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
        onOpenChange={(next, info) => { setOpen(next); if (!next && info.source === "trigger") onClose(); }}
        open={open}
        placement="bottomRight"
        rootClassName="account-menu"
        trigger={["click"]}
      >
        <button type="button" aria-label={t("actions.account")} title={t("actions.account")}><CircleUserRound size={18} /></button>
      </Dropdown>
    </>
  );
}
