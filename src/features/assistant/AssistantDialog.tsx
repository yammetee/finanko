import { Button, Space, Typography } from "antd";
import { useMemo, useState } from "react";
import { getCategoryNameById } from "../../shared/i18n/displayText";
import { useI18n } from "../../shared/i18n/i18nContext";
import { DraggablePanel } from "../../shared/ui/DraggablePanel";
import {
  ASSISTANT_ACTIONS,
  getAssistantResponseMock,
  type AssistantActionId,
  type AssistantSummary,
} from "./assistantSummary";

const { Text, Title } = Typography;

interface AssistantDialogProps {
  open: boolean;
  summary: AssistantSummary;
  onClose: () => void;
}

export function AssistantDialog({ open, summary, onClose }: AssistantDialogProps) {
  const { t } = useI18n();
  const [activeAction, setActiveAction] =
    useState<AssistantActionId>("portfolio_overview");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>();

  const response = useMemo(
    () => getAssistantResponseMock(activeAction, summary, selectedCategoryId, t),
    [activeAction, selectedCategoryId, summary, t],
  );

  return (
    <DraggablePanel
      open={open}
      title={t("nav.assistant")}
      className="draggable-panel assistant-panel"
      defaultPosition={{ x: 520, y: 86 }}
      overlay
      onClose={onClose}
    >
      <Space direction="vertical" size={14} style={{ width: "100%" }}>
          <Text className="muted">
            {t("assistant.safeActions")}
          </Text>
          <Space direction="vertical" size={10} style={{ width: "100%" }}>
            {ASSISTANT_ACTIONS.map((action) => (
              <Button
                key={action.id}
                block
                type={activeAction === action.id ? "primary" : "default"}
                onClick={() => setActiveAction(action.id)}
              >
                {t(action.label)}
              </Button>
            ))}
          </Space>
          {activeAction === "category_spending" ? (
            <Space direction="vertical" size={8} style={{ width: "100%" }}>
              <Text className="muted">{t("assistant.category")}</Text>
              {summary.topCategories.map((category) => (
                <Button
                  key={category.id}
                  block
                  type={selectedCategoryId === category.id ? "primary" : "default"}
                  onClick={() => setSelectedCategoryId(category.id)}
                >
                  {getCategoryNameById(category.id, category.name, t)}
                </Button>
              ))}
            </Space>
          ) : null}
          <div className="assistant-response">
            <Title level={5} style={{ marginTop: 0 }}>
              {t(
                ASSISTANT_ACTIONS.find((action) => action.id === activeAction)?.label ??
                  "assistant.action.portfolio",
              )}
            </Title>
            <Text>{response}</Text>
          </div>
      </Space>
    </DraggablePanel>
  );
}
