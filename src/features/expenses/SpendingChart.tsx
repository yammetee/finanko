import type { Locale } from "../../shared/i18n/i18nContext";
import type { Currency } from "../../shared/types/finance";
import type { ExpenseTrendBucket } from "./expenseAnalytics";

const HEIGHT = 160;
const LEFT = 12;
const RIGHT = 98;
const TOP = 10;
const BOTTOM = 124;

interface SpendingChartProps {
  buckets: ExpenseTrendBucket[];
  currency: Currency;
  locale: Locale;
  label: string;
}

function dateLabel(bucket: ExpenseTrendBucket, locale: Locale, count: number) {
  const date = new Date(bucket.start);
  const language = locale === "ru" ? "ru-RU" : "en-US";
  if (bucket.unit === "hour") return new Intl.DateTimeFormat(language, { hour: "2-digit" }).format(date);
  if (bucket.unit === "month") return new Intl.DateTimeFormat(language, { month: "short" }).format(date).replace(".", "");
  if (bucket.unit === "year") return String(date.getFullYear());
  if (count === 7) return new Intl.DateTimeFormat(language, { weekday: "short" }).format(date).replace(".", "");
  return String(date.getDate());
}

function money(value: number, currency: Currency, locale: Locale) {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function SpendingChart({ buckets, currency, locale, label }: SpendingChartProps) {
  const values = buckets.map((bucket) => bucket.value);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values) * 1.06;
  const span = max - min || 1;
  const points = buckets.map((bucket, index) => ({
    ...bucket,
    x: buckets.length <= 1 ? 55 : LEFT + index / (buckets.length - 1) * (RIGHT - LEFT),
    y: TOP + (max - bucket.value) / span * (BOTTOM - TOP),
  }));
  const ticks = [max, min + span / 2, min];
  const showLabel = (index: number) => buckets.length <= 8 || index === 0 || index === buckets.length - 1 || index % Math.ceil(buckets.length / 6) === 0;

  return (
    <div className="chart">
      <svg height={HEIGHT} width="100%" role="img" aria-label={label}>
        {ticks.map((value) => {
          const y = TOP + (max - value) / span * (BOTTOM - TOP);
          return (
            <g className="chart-grid" key={value}>
              <line x1={`${LEFT}%`} x2={`${RIGHT}%`} y1={y} y2={y} />
              <text x={`${LEFT - 1.5}%`} y={y + 3} textAnchor="end">{money(value, currency, locale)}</text>
            </g>
          );
        })}
        {points.slice(1).map((point, index) => (
          <line className="chart-line" key={point.key} x1={`${points[index].x}%`} y1={points[index].y} x2={`${point.x}%`} y2={point.y} />
        ))}
        {points.map((point, index) => (
          <g key={point.key}>
            {point.transactionCount > 0 || index === 0 || index === points.length - 1 ? (
              <circle className="chart-point" cx={`${point.x}%`} cy={point.y} r="3" />
            ) : null}
            {showLabel(index) ? <text className="chart-date" x={`${point.x}%`} y={BOTTOM + 24} textAnchor="middle">{dateLabel(point, locale, buckets.length)}</text> : null}
          </g>
        ))}
      </svg>
    </div>
  );
}
