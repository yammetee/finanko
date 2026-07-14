import Button from "antd/es/button";
import Typography from "antd/es/typography";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "../../shared/i18n/i18nContext";
import { formatMoney } from "../../shared/lib/format";
import type { SpendingOpportunity } from "./assistantSummary";

const { Text } = Typography;
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

interface AssistantInsightStripProps {
  opportunity: SpendingOpportunity;
  portfolioId: string;
  onOpen: () => void;
}

export function AssistantInsightStrip({ opportunity, portfolioId, onOpen }: AssistantInsightStripProps) {
  const { t } = useI18n();
  const [hidden, setHidden] = useState(true);
  const storageKey = `finanko:assistant-insight:${portfolioId}:${opportunity.id}`;

  useEffect(() => {
    try {
      const hiddenUntil = Number(localStorage.getItem(storageKey) ?? 0);
      setHidden(hiddenUntil > Date.now());
    } catch {
      setHidden(false);
    }
  }, [storageKey]);

  function dismiss() {
    setHidden(true);
    try { localStorage.setItem(storageKey, String(Date.now() + DISMISS_MS)); } catch { /* Storage is optional. */ }
  }

  if (hidden) return null;

  return (
    <aside className="assistant-insight-strip">
      <Sparkles className="assistant-insight-icon" size={18} />
      <div className="assistant-insight-copy">
        <Text strong>{t("assistant.proactiveTitle", { name: opportunity.name })}</Text>
        <Text type="secondary">{t("assistant.proactiveBody", { amount: formatMoney(opportunity.monthlyAverage, opportunity.currency) })}</Text>
      </div>
      <Text className="assistant-insight-saving" strong>{t("assistant.proactiveSaving", { amount: formatMoney(opportunity.annualSavings50, opportunity.currency) })}</Text>
      <Button type="text" icon={<ArrowRight size={16} />} onClick={onOpen}>{t("assistant.view")}</Button>
      <Button type="text" aria-label={t("actions.dismiss")} icon={<X size={16} />} onClick={dismiss} />
    </aside>
  );
}
