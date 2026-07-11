import Alert from "antd/es/alert";
import Button from "antd/es/button";
import Flex from "antd/es/flex";
import List from "antd/es/list";
import Modal from "antd/es/modal";
import Skeleton from "antd/es/skeleton";
import Tag from "antd/es/tag";
import Typography from "antd/es/typography";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../shared/i18n/i18nContext";
import { type AssistantResponse, type AssistantSummary } from "./assistantSummary";
import { getAssistantResponse } from "./assistantAi";

const { Paragraph, Text, Title } = Typography;
const toneColors = { positive: "success", warning: "warning", critical: "error", neutral: "default" } as const;

interface AssistantDialogProps {
  open: boolean;
  summary: AssistantSummary;
  onClose: () => void;
}

export function AssistantDialog({ open, summary, onClose }: AssistantDialogProps) {
  const { locale, t } = useI18n();
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const runAnalysis = useCallback(() => {
    let active = true;
    setError(false);
    setLoading(true);
    void getAssistantResponse({ summary, locale })
      .then((result) => { if (active) setResponse(result); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [locale, summary]);

  useEffect(() => {
    if (!open) return;
    return runAnalysis();
  }, [open, runAnalysis]);

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
      <Flex className="assistant-content" vertical gap={20}>
        {loading ? <Skeleton active paragraph={{ rows: 4 }} /> : error || !response ? (
          <Alert
            action={<Button onClick={runAnalysis}>{t("actions.retry")}</Button>}
            message={t("assistant.requestFailed")}
            showIcon
            type="error"
          />
        ) : (
          <>
            <div className="assistant-verdict">
              <Text className="assistant-eyebrow">{t("assistant.currentSituation")}</Text>
              <Title level={3}>{response.verdict}</Title>
              <Paragraph className="assistant-summary">{response.diagnosis}</Paragraph>
            </div>

            {response.recommendations.length ? (
              <section>
                <Title level={5}>{t("assistant.actionPlan")}</Title>
              <List
                className="assistant-plan"
                dataSource={response.recommendations}
                renderItem={(recommendation) => (
                  <List.Item>
                    <div className="assistant-plan-item">
                      <span className="assistant-priority">{recommendation.priority}</span>
                      <div>
                        <Flex align="center" gap={8} wrap>
                          <Text strong>{recommendation.title}</Text>
                          <Tag color={toneColors[recommendation.tone]}>{recommendation.target}</Tag>
                        </Flex>
                        <Paragraph>{recommendation.action}</Paragraph>
                        <Text type="secondary">{recommendation.rationale}</Text>
                      </div>
                    </div>
                  </List.Item>
                )}
              />
              </section>
            ) : null}

            <Alert message={response.nextReview} type="info" showIcon />
            <Flex align="center" justify="space-between" gap={12} wrap>
              <Text className="assistant-disclaimer" type="secondary">{response.disclaimer}</Text>
              <Button loading={loading} onClick={runAnalysis}>{t("assistant.refresh")}</Button>
            </Flex>
          </>
        )}
      </Flex>
    </Modal>
  );
}
