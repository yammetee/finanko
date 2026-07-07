import { formatMoney } from "../../../shared/lib/format";
import type { Currency } from "../../../shared/types/finance";

interface ChartTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{
    color?: string;
    name?: string;
    value?: number;
    dataKey?: string;
  }>;
  currency: Currency;
}

export function ChartTooltip({ active, label, payload, currency }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload.map((item) => (
        <div className="chart-tooltip-row" key={item.dataKey ?? item.name}>
          <span
            className="chart-tooltip-dot"
            style={{ background: item.color ?? "var(--color-primary)" }}
          />
          <span>{item.name ?? item.dataKey}</span>
          <strong>{formatMoney(Number(item.value ?? 0), currency)}</strong>
        </div>
      ))}
    </div>
  );
}
