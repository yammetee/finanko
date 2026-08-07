import { formatMoney } from "../../shared/lib/format";
import type { Currency } from "../../shared/types/finance";
import type { Locale } from "../../shared/i18n/i18nContext";
import type { ExpenseTrendBucket } from "./expenseAnalytics";

const HEIGHT = 220;
const PLOT = { left: 13, right: 98, top: 14, bottom: 184 };
const Y_TICK_COUNT = 5;

interface ExpenseTrendChartProps {
  buckets: ExpenseTrendBucket[];
  currency: Currency;
  locale: Locale;
  label: string;
}

function pointLabel(bucket: ExpenseTrendBucket, locale: Locale, count: number) {
  const date = new Date(bucket.start);
  const language = locale === "ru" ? "ru-RU" : "en-US";
  if (bucket.unit === "hour") {
    return new Intl.DateTimeFormat(language, { hour: "2-digit" }).format(date);
  }
  if (bucket.unit === "month") {
    return new Intl.DateTimeFormat(language, { month: "short" }).format(date).replace(".", "");
  }
  if (bucket.unit === "year") return String(date.getFullYear());
  if (count === 7) {
    return new Intl.DateTimeFormat(language, { weekday: "short" }).format(date).replace(".", "");
  }
  return String(date.getDate());
}

function shouldShowXLabel(index: number, count: number, unit: ExpenseTrendBucket["unit"]) {
  if (count <= 12) return true;
  const interval = unit === "hour" ? 4 : Math.ceil(count / 8);
  return index === 0 || index === count - 1 || index % interval === 0;
}

function formatChartMoney(amount: number, currency: Currency, locale: Locale) {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

export function ExpenseTrendChart({ buckets, currency, locale, label }: ExpenseTrendChartProps) {
  const values = buckets.map((bucket) => bucket.value);
  const minimum = Math.min(0, ...values) * 1.08;
  const maximum = Math.max(1, ...values) * 1.08;
  const span = maximum - minimum || 1;
  const plotHeight = PLOT.bottom - PLOT.top;
  const xFor = (index: number) => buckets.length <= 1
    ? (PLOT.left + PLOT.right) / 2
    : PLOT.left + (index / (buckets.length - 1)) * (PLOT.right - PLOT.left);
  const yFor = (value: number) => PLOT.top + ((maximum - value) / span) * plotHeight;
  const points = buckets.map((bucket, index) => ({
    ...bucket,
    x: xFor(index),
    y: yFor(bucket.value),
  }));
  const yTicks = Array.from({ length: Y_TICK_COUNT }, (_, index) => {
    const ratio = index / (Y_TICK_COUNT - 1);
    return {
      value: maximum - ratio * span,
      y: PLOT.top + ratio * plotHeight,
    };
  });
  const accessibilitySummary = points
    .map((point) => `${pointLabel(point, locale, buckets.length)} ${formatMoney(point.value, currency)}`)
    .join(", ");

  return (
    <div className="expense-line-chart">
      <svg
        aria-label={`${label}: ${accessibilitySummary}`}
        height={HEIGHT}
        role="img"
        width="100%"
      >
        {yTicks.map((tick) => (
          <g className="expense-line-chart-y-tick" key={tick.y}>
            <line x1={`${PLOT.left}%`} x2={`${PLOT.right}%`} y1={tick.y} y2={tick.y} />
            <text x={`${PLOT.left - 1.5}%`} y={tick.y + 4} textAnchor="end">
              {formatChartMoney(tick.value, currency, locale)}
            </text>
          </g>
        ))}

        {points.slice(1).map((point, index) => {
          const previous = points[index];
          return (
            <line
              className="expense-line-chart-path"
              key={`${previous.key}-${point.key}`}
              x1={`${previous.x}%`}
              x2={`${point.x}%`}
              y1={previous.y}
              y2={point.y}
            />
          );
        })}

        {points.map((point, index) => (
          <g className="expense-line-chart-point" key={point.key}>
            {point.transactionCount > 0 || index === 0 || index === points.length - 1 ? (
              <circle cx={`${point.x}%`} cy={point.y} r={buckets.length > 20 ? 3 : 4.5}>
                <title>
                  {`${pointLabel(point, locale, buckets.length)}: ${formatMoney(point.value, currency)}`}
                </title>
              </circle>
            ) : null}
            {shouldShowXLabel(index, buckets.length, point.unit) ? (
              <text className="expense-line-chart-x-label" x={`${point.x}%`} y={PLOT.bottom + 27} textAnchor="middle">
                {pointLabel(point, locale, buckets.length)}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}
