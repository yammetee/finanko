import Button from "antd/es/button";
import Typography from "antd/es/typography";
import { useEffect, useState } from "react";
import { getCategoryNameById } from "../../shared/i18n/displayText";
import { useI18n } from "../../shared/i18n/i18nContext";
import { useMediaQuery } from "../../shared/lib/useMediaQuery";
import { DraggablePanel } from "../../shared/ui/DraggablePanel";
import { isAiDailyLimitError } from "../../shared/api/aiErrors";
import {
  ASSISTANT_ACTIONS,
  type AssistantActionId,
  type AssistantSummary,
} from "./assistantSummary";
import {
  getAssistantFallbackResponse,
  getAssistantResponse,
} from "./assistantAi";

const { Text, Title } = Typography;

interface AssistantDialogProps {
  open: boolean;
  summary: AssistantSummary;
  onClose: () => void;
}

export function AssistantDialog({ open, summary, onClose }: AssistantDialogProps) {
  const { locale, t } = useI18n();
  const isMobile = useMediaQuery("(max-width: 1180px)");
  const [activeAction, setActiveAction] =
    useState<AssistantActionId>("portfolio_overview");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>();
  const [response, setResponse] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !isMobile) return;
    const scrollY = window.scrollY;
    const previousOverflow = document.body.style.overflow;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      window.scrollTo(0, scrollY);
    };
  }, [isMobile, open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const fallback = getAssistantFallbackResponse(activeAction, summary, selectedCategoryId, t);
    setResponse(fallback);
    setNotice("");
    setLoading(true);
    void getAssistantResponse({
      actionId: activeAction,
      summary,
      selectedCategoryId,
      locale,
    })
      .then((aiResponse) => {
        if (!active) return;
        if (aiResponse) setResponse(aiResponse);
      })
      .catch((error) => {
        if (!active) return;
        if (isAiDailyLimitError(error)) {
          setNotice(t("assistant.aiDailyLimitFallback"));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeAction, locale, open, selectedCategoryId, summary, t]);

  return (
    <DraggablePanel
      open={open}
      title={t("nav.assistant")}
      className="draggable-panel assistant-panel"
      defaultPosition={{ x: 520, y: 86 }}
      draggable={!isMobile}
      overlay
      onClose={onClose}
    >
      <div className="assistant-content">
        <Text className="muted assistant-helper">{t("assistant.safeActions")}</Text>
        <div className="assistant-actions">
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
        </div>
        {activeAction === "category_spending" ? (
          <div className="assistant-category-actions">
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
          </div>
        ) : null}
        <div className="assistant-response">
          <Title level={5} style={{ marginTop: 0 }}>
            {t(
              ASSISTANT_ACTIONS.find((action) => action.id === activeAction)?.label ??
                "assistant.action.portfolio",
            )}
          </Title>
          {loading ? <Text className="muted">{t("assistant.loading")}</Text> : null}
          {notice ? <Text className="muted">{notice}</Text> : null}
          <Text>{response}</Text>
        </div>
      </div>
    </DraggablePanel>
  );
}
