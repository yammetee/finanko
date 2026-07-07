import { formatMoney } from "../../../shared/lib/format";
import type { Currency } from "../../../shared/types/finance";

interface MetricCardProps {
  title: string;
  value: number;
  currency: Currency;
  positive?: boolean;
  negative?: boolean;
}

export function MetricCard({
  title,
  value,
  currency,
  positive,
  negative,
}: MetricCardProps) {
  const toneClass = positive ? "is-positive" : negative ? "is-negative" : "";

  return (
    <div className={`metric-item ${toneClass}`}>
      <span className="metric-label">{title}</span>
      <strong className="metric-value">{formatMoney(value, currency)}</strong>
    </div>
  );
}
