import Button from "antd/es/button";
import Skeleton from "antd/es/skeleton";
import Typography from "antd/es/typography";
import { Sparkles, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "../../shared/i18n/i18nContext";
import { getWeeklyRecap } from "./assistantAi";
import type { AssistantSummary, WeeklyRecapResponse } from "./assistantSummary";

const { Paragraph, Text, Title } = Typography;

export function WeeklyRecap({ portfolioId, summary }: { portfolioId: string; summary: AssistantSummary }) {
  const { locale, t } = useI18n();
  const [recap, setRecap] = useState<WeeklyRecapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekKey = monday.toISOString().slice(0, 10);
  const cacheKey = `finanko:weekly-recap:${portfolioId}:${weekKey}:${locale}`;
  const hiddenKey = `finanko:weekly-recap-hidden:${portfolioId}:${weekKey}`;

  useEffect(() => {
    if (summary.transactionCount === 0) { setLoading(false); return; }
    try {
      if (localStorage.getItem(hiddenKey)) { setHidden(true); setLoading(false); return; }
      const cached = localStorage.getItem(cacheKey);
      if (cached) { setRecap(JSON.parse(cached) as WeeklyRecapResponse); setLoading(false); return; }
    } catch { /* Cache is optional. */ }
    let active = true;
    void getWeeklyRecap({ summary, locale }).then((result) => {
      if (!active) return; setRecap(result);
      try { localStorage.setItem(cacheKey, JSON.stringify(result)); } catch { /* Cache is optional. */ }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cacheKey, hiddenKey, locale, summary]);

  function dismiss() { setHidden(true); try { localStorage.setItem(hiddenKey, "1"); } catch { /* Storage is optional. */ } }
  if (hidden || (!loading && !recap)) return null;

  return <section className="weekly-recap">
    <Sparkles size={18} className="weekly-recap-icon" />
    {loading ? <Skeleton active paragraph={{ rows: 2 }} /> : recap ? <div className="weekly-recap-body">
      <div className="weekly-recap-heading"><Text className="assistant-section-label">{t("assistant.weeklyRecap")}</Text><Title level={4}>{recap.headline}</Title></div>
      <Paragraph>{recap.summary}</Paragraph>
      <div className="weekly-recap-details">
        <div className="weekly-recap-highlights">{recap.highlights.map((item) => <div key={`${item.label}-${item.value}`} className={`is-${item.tone}`}><Text type="secondary">{item.label}</Text><Text strong>{item.value}</Text></div>)}</div>
        <Text className="weekly-recap-focus"><span>{t("assistant.weeklyFocus")}</span> {recap.focus}</Text>
        <div className="weekly-recap-feedback"><Button type="text" className={feedback === "up" ? "is-active" : ""} aria-label={t("assistant.helpful")} icon={<ThumbsUp size={14} />} onClick={() => setFeedback("up")} /><Button type="text" className={feedback === "down" ? "is-active" : ""} aria-label={t("assistant.notHelpful")} icon={<ThumbsDown size={14} />} onClick={() => setFeedback("down")} /></div>
      </div>
    </div> : null}
    <Button type="text" className="weekly-recap-close" aria-label={t("actions.dismiss")} icon={<X size={16} />} onClick={dismiss} />
  </section>;
}
