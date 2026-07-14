import Alert from "antd/es/alert";
import Button from "antd/es/button";
import Flex from "antd/es/flex";
import Modal from "antd/es/modal";
import Skeleton from "antd/es/skeleton";
import Tag from "antd/es/tag";
import Typography from "antd/es/typography";
import { ArrowRight, Calculator, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMoney } from "../../shared/lib/format";
import { useI18n } from "../../shared/i18n/i18nContext";
import { type AssistantActionType, type AssistantResponse, type AssistantSummary } from "./assistantSummary";
import { getAssistantResponse } from "./assistantAi";

const { Paragraph, Text, Title } = Typography;
const statusColors = { stable: "success", attention: "warning", critical: "error", insufficient_data: "default" } as const;

interface AssistantDialogProps {
  open: boolean;
  summary: AssistantSummary;
  onClose: () => void;
  onAction: (action: AssistantActionType) => void;
}

export function AssistantDialog({ open, summary, onClose, onAction }: AssistantDialogProps) {
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

  const scenario = useMemo(() => {
    if (!response?.scenario) return null;
    const opportunity = summary.spendingOpportunities.find(({ id }) => id === response.scenario?.opportunityId);
    if (!opportunity) return null;
    const annualSavings = response.scenario.reductionPercent === 25
      ? opportunity.annualSavings25
      : opportunity.annualSavings50;
    return { ...response.scenario, opportunity, annualSavings };
  }, [response, summary.spendingOpportunities]);

  return (
    <Modal centered className="assistant-modal" destroyOnHidden footer={null} open={open} title={t("nav.assistant")} width={680} onCancel={onClose}>
      <Flex className="assistant-content" vertical gap={16}>
        {loading ? <Skeleton active paragraph={{ rows: 5 }} /> : error || !response ? (
          <Alert action={<Button onClick={runAnalysis}>{t("actions.retry")}</Button>} message={t("assistant.requestFailed")} showIcon type="error" />
        ) : (
          <>
            <section className="assistant-overview">
              <Tag color={statusColors[response.status]}>{t(`assistant.status.${response.status}`)}</Tag>
              <Title level={3}>{response.headline}</Title>
              <Paragraph>{response.summary}</Paragraph>
              {response.evidence.length ? (
                <div className="assistant-evidence">
                  {response.evidence.map((item) => (
                    <div key={`${item.label}-${item.value}`}>
                      <Text type="secondary">{item.label}</Text>
                      <Text strong>{item.value}</Text>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="assistant-action">
              <Text className="assistant-section-label">{t("assistant.nextAction")}</Text>
              <Title level={5}>{response.primaryAction.title}</Title>
              <Paragraph>{response.primaryAction.description}</Paragraph>
              {response.primaryAction.type !== "none" && response.primaryAction.buttonLabel ? (
                <Button type="primary" icon={<ArrowRight size={16} />} onClick={() => onAction(response.primaryAction.type)}>
                  {response.primaryAction.buttonLabel}
                </Button>
              ) : null}
            </section>

            {scenario ? (
              <section className="assistant-scenario">
                <Calculator size={20} />
                <div>
                  <Text className="assistant-section-label">{t("assistant.whatIf")}</Text>
                  <Title level={5}>{scenario.title}</Title>
                  <Paragraph>{scenario.suggestion}</Paragraph>
                  <div className="assistant-scenario-values">
                    <div><Text type="secondary">{t("assistant.monthlyAverage")}</Text><Text strong>{formatMoney(scenario.opportunity.monthlyAverage, scenario.opportunity.currency)}</Text></div>
                    <div><Text type="secondary">{t("assistant.annualSavings")}</Text><Text className="assistant-saving" strong>{formatMoney(scenario.annualSavings, scenario.opportunity.currency)}</Text></div>
                  </div>
                </div>
              </section>
            ) : null}

            <footer className="assistant-footer">
              <div><Text type="secondary">{response.nextCheck}</Text><Text className="assistant-disclaimer" type="secondary">{response.disclaimer}</Text></div>
              <Button aria-label={t("assistant.refresh")} icon={<RefreshCw size={16} />} loading={loading} onClick={runAnalysis} />
            </footer>
          </>
        )}
      </Flex>
    </Modal>
  );
}
