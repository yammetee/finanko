import Alert from "antd/es/alert";
import Card from "antd/es/card";
import Flex from "antd/es/flex";
import List from "antd/es/list";
import Modal from "antd/es/modal";
import Select from "antd/es/select";
import Skeleton from "antd/es/skeleton";
import Tag from "antd/es/tag";
import Tabs from "antd/es/tabs";
import Typography from "antd/es/typography";
import { useEffect, useState } from "react";
import { getCategoryNameById } from "../../shared/i18n/displayText";
import { useI18n } from "../../shared/i18n/i18nContext";
import { formatMoney } from "../../shared/lib/format";
import { ASSISTANT_ACTIONS, type AssistantActionId, type AssistantResponse, type AssistantSummary } from "./assistantSummary";
import { getAssistantFallbackResponse, getAssistantResponse } from "./assistantAi";

const { Paragraph, Text, Title } = Typography;
const toneColors = { positive: "success", warning: "warning", critical: "error", neutral: "default" } as const;

interface AssistantDialogProps {
  open: boolean;
  summary: AssistantSummary;
  onClose: () => void;
}

export function AssistantDialog({ open, summary, onClose }: AssistantDialogProps) {
  const { locale, t } = useI18n();
  const [activeAction, setActiveAction] = useState<AssistantActionId>("portfolio_overview");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>();
  const [response, setResponse] = useState<AssistantResponse>(() => getAssistantFallbackResponse("portfolio_overview", summary, locale));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setResponse(getAssistantFallbackResponse(activeAction, summary, locale, selectedCategoryId));
    setLoading(true);
    void getAssistantResponse({ actionId: activeAction, summary, selectedCategoryId: selectedCategoryId ?? summary.topCategories[0]?.id, locale })
      .then((result) => { if (active && result) setResponse(result); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [activeAction, locale, open, selectedCategoryId, summary]);

  return (
    <Modal
      centered
      className="assistant-modal"
      destroyOnHidden
      footer={null}
      open={open}
      title={t("nav.assistant")}
      width={760}
      onCancel={onClose}
    >
      <Flex vertical gap={16}>
        <Tabs
          activeKey={activeAction}
          items={ASSISTANT_ACTIONS.map((action) => ({ key: action.id, label: t(action.label) }))}
          onChange={(value) => setActiveAction(value as AssistantActionId)}
        />

        {activeAction === "category_spending" ? (
          <Select
            aria-label={t("assistant.category")}
            placeholder={t("assistant.category")}
            value={selectedCategoryId ?? summary.topCategories[0]?.id}
            options={summary.topCategories.map((category) => ({
              value: category.id,
              label: `${getCategoryNameById(category.id, category.name, t)} · ${formatMoney(category.amount, summary.currency)} · ${Math.round(category.sharePercent)}%`,
            }))}
            onChange={setSelectedCategoryId}
          />
        ) : null}

        {loading ? <Skeleton active paragraph={{ rows: 4 }} /> : (
          <>
            <div>
              <Title level={4}>{response.headline}</Title>
              <Paragraph className="assistant-summary">{response.summary}</Paragraph>
            </div>

            {response.insights.length ? (
              <div className="assistant-insight-grid">
                {response.insights.map((insight) => (
                  <Card key={`${insight.label}-${insight.value}`} size="small">
                    <Flex align="center" justify="space-between" gap={8}>
                      <Text type="secondary">{insight.label}</Text>
                      <Tag color={toneColors[insight.tone]}>{insight.value}</Tag>
                    </Flex>
                    <Paragraph className="assistant-insight-detail">{insight.detail}</Paragraph>
                  </Card>
                ))}
              </div>
            ) : null}

            {response.scenarios.length ? (
              <List
                className="assistant-scenarios"
                header={<Text strong>{t("assistant.scenarios")}</Text>}
                dataSource={response.scenarios}
                renderItem={(scenario) => (
                  <List.Item>
                    <List.Item.Meta title={scenario.title} description={`${scenario.impact} · ${scenario.tradeoff}`} />
                  </List.Item>
                )}
              />
            ) : null}

            {response.caveats.map((caveat) => <Alert key={caveat} message={caveat} type="info" showIcon />)}
          </>
        )}
      </Flex>
    </Modal>
  );
}
