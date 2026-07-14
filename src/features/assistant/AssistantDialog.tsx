import Alert from "antd/es/alert";
import Button from "antd/es/button";
import Flex from "antd/es/flex";
import Input from "antd/es/input";
import Modal from "antd/es/modal";
import Skeleton from "antd/es/skeleton";
import Tabs from "antd/es/tabs";
import Tag from "antd/es/tag";
import Typography from "antd/es/typography";
import { ArrowRight, Calculator, RefreshCw, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMoney } from "../../shared/lib/format";
import { useI18n } from "../../shared/i18n/i18nContext";
import { type AssistantActionType, type AssistantChatResponse, type AssistantResponse, type AssistantSummary } from "./assistantSummary";
import { getAssistantChatResponse, getAssistantResponse } from "./assistantAi";

const { Paragraph, Text, Title } = Typography;
const statusColors = { stable: "success", attention: "warning", critical: "error", insufficient_data: "default" } as const;

interface AssistantDialogProps { open: boolean; summary: AssistantSummary; onClose: () => void; onAction: (action: AssistantActionType) => void; }
interface ChatMessage { role: "user" | "assistant"; content: string; result?: AssistantChatResponse; feedback?: "up" | "down"; }

function FeedbackButtons({ value, onChange }: { value?: "up" | "down"; onChange: (value: "up" | "down") => void }) {
  const { t } = useI18n();
  return <Flex gap={2} className="assistant-feedback">
    <Button type="text" aria-label={t("assistant.helpful")} icon={<ThumbsUp size={14} />} className={value === "up" ? "is-active" : ""} onClick={() => onChange("up")} />
    <Button type="text" aria-label={t("assistant.notHelpful")} icon={<ThumbsDown size={14} />} className={value === "down" ? "is-active" : ""} onClick={() => onChange("down")} />
  </Flex>;
}

export function AssistantDialog({ open, summary, onClose, onAction }: AssistantDialogProps) {
  const { locale, t } = useI18n();
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const runAnalysis = useCallback(() => {
    let active = true; setError(false); setLoading(true);
    void getAssistantResponse({ summary, locale }).then((result) => { if (active) setResponse(result); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [locale, summary]);

  useEffect(() => { if (open) return runAnalysis(); }, [open, runAnalysis]);

  const scenario = useMemo(() => {
    if (!response?.scenario) return null;
    const opportunity = summary.spendingOpportunities.find(({ id }) => id === response.scenario?.opportunityId);
    if (!opportunity) return null;
    return { ...response.scenario, opportunity, annualSavings: response.scenario.reductionPercent === 25 ? opportunity.annualSavings25 : opportunity.annualSavings50 };
  }, [response, summary.spendingOpportunities]);

  const suggestedQuestions = [...messages].reverse().find((message) => message.result)?.result?.suggestedQuestions ?? [
    t("assistant.question.spending"), t("assistant.question.netWorth"), t("assistant.question.saving"),
  ];

  async function sendQuestion(value = question) {
    const normalized = value.trim(); if (!normalized || chatLoading) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: normalized }];
    setMessages(nextMessages); setQuestion(""); setChatLoading(true);
    try {
      const result = await getAssistantChatResponse({
        summary, locale, question: normalized,
        conversation: nextMessages.slice(-6).map(({ role, content }) => ({ role, content })),
      });
      setMessages((current) => [...current, { role: "assistant", content: result.answer, result }]);
    } catch {
      setMessages((current) => [...current, { role: "assistant", content: t("assistant.requestFailed") }]);
    } finally { setChatLoading(false); }
  }

  function setFeedback(index: number, feedback: "up" | "down") {
    setMessages((current) => current.map((message, messageIndex) => messageIndex === index ? { ...message, feedback } : message));
  }

  const overview = loading ? <Skeleton active paragraph={{ rows: 5 }} /> : error || !response ? (
    <Alert action={<Button onClick={runAnalysis}>{t("actions.retry")}</Button>} message={t("assistant.requestFailed")} showIcon type="error" />
  ) : <Flex vertical gap={16}>
    <section className="assistant-overview"><Tag color={statusColors[response.status]}>{t(`assistant.status.${response.status}`)}</Tag><Title level={3}>{response.headline}</Title><Paragraph>{response.summary}</Paragraph>{response.evidence.length ? <div className="assistant-evidence">{response.evidence.map((item) => <div key={`${item.label}-${item.value}`}><Text type="secondary">{item.label}</Text><Text strong>{item.value}</Text></div>)}</div> : null}</section>
    <section className="assistant-action"><Text className="assistant-section-label">{t("assistant.nextAction")}</Text><Title level={5}>{response.primaryAction.title}</Title><Paragraph>{response.primaryAction.description}</Paragraph>{response.primaryAction.type !== "none" && response.primaryAction.buttonLabel ? <Button type="primary" icon={<ArrowRight size={16} />} onClick={() => onAction(response.primaryAction.type)}>{response.primaryAction.buttonLabel}</Button> : null}</section>
    {scenario ? <section className="assistant-scenario"><Calculator size={20} /><div><Text className="assistant-section-label">{t("assistant.whatIf")}</Text><Title level={5}>{scenario.title}</Title><Paragraph>{scenario.suggestion}</Paragraph><div className="assistant-scenario-values"><div><Text type="secondary">{t("assistant.monthlyAverage")}</Text><Text strong>{formatMoney(scenario.opportunity.monthlyAverage, scenario.opportunity.currency)}</Text></div><div><Text type="secondary">{t("assistant.annualSavings")}</Text><Text className="assistant-saving" strong>{formatMoney(scenario.annualSavings, scenario.opportunity.currency)}</Text></div></div></div></section> : null}
    <footer className="assistant-footer"><div><Text type="secondary">{response.nextCheck}</Text><Text className="assistant-disclaimer" type="secondary">{response.disclaimer}</Text></div><Button aria-label={t("assistant.refresh")} icon={<RefreshCw size={16} />} onClick={runAnalysis} /></footer>
  </Flex>;

  const chat = <div className="assistant-chat">
    <div className="assistant-chat-log">
      {messages.length === 0 ? <div className="assistant-chat-empty"><Title level={4}>{t("assistant.chatTitle")}</Title><Text type="secondary">{t("assistant.chatDescription")}</Text></div> : messages.map((message, index) => <div key={`${message.role}-${index}`} className={`assistant-chat-message is-${message.role}`}><Paragraph>{message.content}</Paragraph>{message.result?.evidence.length ? <div className="assistant-chat-evidence">{message.result.evidence.map((item) => <Text key={`${item.label}-${item.value}`}><span>{item.label}</span> {item.value}</Text>)}</div> : null}{message.role === "assistant" && message.result ? <FeedbackButtons value={message.feedback} onChange={(value) => setFeedback(index, value)} /> : null}</div>)}
      {chatLoading ? <Skeleton active paragraph={{ rows: 2 }} /> : null}
    </div>
    <Flex className="assistant-question-chips" gap={6} wrap>{suggestedQuestions.map((suggestion) => <Button key={suggestion} size="small" onClick={() => void sendQuestion(suggestion)}>{suggestion}</Button>)}</Flex>
    <div className="assistant-chat-composer"><Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} value={question} placeholder={t("assistant.askPlaceholder")} onChange={(event) => setQuestion(event.target.value)} onPressEnter={(event) => { if (!event.shiftKey) { event.preventDefault(); void sendQuestion(); } }} /><Button type="primary" aria-label={t("assistant.send")} icon={<Send size={16} />} disabled={!question.trim()} loading={chatLoading} onClick={() => void sendQuestion()} /></div>
  </div>;

  return <Modal centered className="assistant-modal" destroyOnHidden footer={null} open={open} title={t("nav.assistant")} width={720} onCancel={onClose}><Tabs items={[{ key: "chat", label: t("assistant.chat"), children: chat }, { key: "overview", label: t("assistant.overview"), children: overview }]} /></Modal>;
}
