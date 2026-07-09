import Input from "antd/es/input";
import Modal from "antd/es/modal";
import Space from "antd/es/space";
import Typography from "antd/es/typography";
import { useState } from "react";
import { getPortfolioName } from "../../shared/i18n/displayText";
import { useI18n } from "../../shared/i18n/i18nContext";
import type { Portfolio } from "../../shared/types/finance";

const { Text } = Typography;

interface DeletePortfolioModalProps {
  open: boolean;
  portfolio: Portfolio | undefined;
  onCancel: () => void;
  onConfirm: (portfolioId: string) => void;
}

export function DeletePortfolioModal({
  open,
  portfolio,
  onCancel,
  onConfirm,
}: DeletePortfolioModalProps) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const portfolioName = portfolio ? getPortfolioName(portfolio, t) : "";
  const canDelete = value.trim() === portfolioName;

  return (
    <Modal
      open={open}
      title={t("confirm.deletePortfolio.title")}
      okText={t("actions.deletePortfolio")}
      okButtonProps={{ danger: true, disabled: !canDelete }}
      onCancel={() => {
        setValue("");
        onCancel();
      }}
      onOk={() => {
        if (!portfolio || !canDelete) return;
        onConfirm(portfolio.id);
        setValue("");
      }}
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Text className="muted">{t("confirm.deletePortfolio.description")}</Text>
        <Text strong>{portfolioName}</Text>
        <Input
          aria-label={t("confirm.deletePortfolio.inputLabel")}
          placeholder={portfolioName}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </Space>
    </Modal>
  );
}
