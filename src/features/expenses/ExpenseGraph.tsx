import type { Locale } from "../../shared/i18n/i18nContext";
import type { Currency } from "../../shared/types/finance";
import type { ExpenseTrendBucket } from "./expenseAnalytics";

const HEIGHT = 142;
const PLOT = { left: 11, right: 98, top: 8, bottom: 108 };

interface ExpenseGraphProps {
  buckets: ExpenseTrendBucket[];
  currency: Currency;
  locale: Locale;
  label: string;
}

function bucketLabel(bucket: ExpenseTrendBucket, locale: Locale, count: number) {
  const date = new Date(bucket.start);
  const language = locale === "ru" ? "ru-RU" : "en-US";
  if (bucket.unit === "hour") return new Intl.DateTimeFormat(language, { hour: "2-digit" }).format(date);
  if (bucket.unit === "month") return new Intl.DateTimeFormat(language, { month: "short" }).format(date).replace(".", "");
  if (bucket.unit === "year") return String(date.getFullYear());
  if (count === 7) return new Intl.DateTimeFormat(language, { weekday: "short" }).format(date).replace(".", "");
  return String(date.getDate());
}

function compactMoney(amount: number, currency: Currency, locale: Locale) {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

function showLabel(index: number, count: number) {
  if (count <= 8) return true;
  const interval = Math.ceil(count / 6);
  return index === 0 || index === count - 1 || index % interval === 0;
}

export function ExpenseGraph({ buckets, currency, locale, label }: ExpenseGraphProps) {
  const values = buckets.map((bucket) => bucket.value);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(1, ...values) * 1.06;
  const span = maximum - minimum || 1;
  const plotHeight = PLOT.bottom - PLOT.top;
  const points = buckets.map((bucket, index) => ({
    ...bucket,
    x: buckets.length <= 1 ? 54 : PLOT.left + index / (buckets.length - 1) * (PLOT.right - PLOT.left),
    y: PLOT.top + (maximum - bucket.value) / span * plotHeight,
  }));
  const ticks = [maximum, minimum + span / 2, minimum];
  const summary = points.map((point) => `${bucketLabel(point, locale, buckets.length)} ${compactMoney(point.value, currency, locale)}`).join(", ");

  return (
    <div className="spending-graph">
      <svg width="100%" height={HEIGHT} role="img" aria-label={`${label}: ${summary}`}>
        {ticks.map((value) => {
          const y = PLOT.top + (maximum - value) / span * plotHeight;
          return (
            <g className="graph-grid" key={value}>
              <line x1={`${PLOT.left}%`} x2={`${PLOT.right}%`} y1={y} y2={y} />
              <text x={`${PLOT.left - 1.5}%`} y={y + 3} textAnchor="end">{compactMoney(value, currency, locale)}</text>
            </g>
          );
        })}
        {points.slice(1).map((point, index) => (
          <line
            className="graph-line"
            key={point.key}
            x1={`${points[index].x}%`}
            y1={points[index].y}
            x2={`${point.x}%`}
            y2={point.y}
          />
        ))}
        {points.map((point, index) => (
          <g key={point.key}>
            {point.transactionCount > 0 || index === 0 || index === points.length - 1 ? (
              <circle className="graph-point" cx={`${point.x}%`} cy={point.y} r="3" />
            ) : null}
            {showLabel(index, points.length) ? (
              <text className="graph-label" x={`${point.x}%`} y={PLOT.bottom + 23} textAnchor="middle">
                {bucketLabel(point, locale, points.length)}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}
