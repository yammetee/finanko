import Button from "antd/es/button";
import Popover from "antd/es/popover";
import Skeleton from "antd/es/skeleton";
import Typography from "antd/es/typography";
import { Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../shared/i18n/i18nContext";
import { getContextInsight } from "./assistantAi";
import type { AssistantSummary, ContextInsightResponse } from "./assistantSummary";

const { Paragraph, Text } = Typography;
type InsightContext = "net_worth" | "cash_flow" | "categories" | "accounts";

export function ContextInsightButton({ context, summary }: { context: InsightContext; summary: AssistantSummary }) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState<ContextInsightResponse | null>(null);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  function loadInsight() {
    if (insight || loading) return;
    setLoading(true);
    void getContextInsight({ summary, locale, context }).then(setInsight).finally(() => setLoading(false));
  }

  const content = <div className="context-insight-content">
    {loading ? <Skeleton active paragraph={{ rows: 2 }} /> : insight ? <>
      <Text strong>{insight.headline}</Text><Paragraph>{insight.explanation}</Paragraph>
      {insight.factors.map((factor) => <Text key={factor} className="context-insight-factor">{factor}</Text>)}
      <div className="context-insight-feedback"><Button type="text" className={feedback === "up" ? "is-active" : ""} aria-label={t("assistant.helpful")} icon={<ThumbsUp size={14} />} onClick={() => setFeedback("up")} /><Button type="text" className={feedback === "down" ? "is-active" : ""} aria-label={t("assistant.notHelpful")} icon={<ThumbsDown size={14} />} onClick={() => setFeedback("down")} /></div>
    </> : <Text type="secondary">{t("assistant.requestFailed")}</Text>}
  </div>;

  return <Popover content={content} open={open} placement="bottomRight" trigger="click" onOpenChange={(nextOpen) => { setOpen(nextOpen); if (nextOpen) loadInsight(); }}>
    <Button type="text" className="context-insight-button" aria-label={t("assistant.explainView")} icon={<Sparkles size={16} />} />
  </Popover>;
}
