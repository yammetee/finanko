import { useLayoutEffect, useMemo, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { Locale } from "../i18n/i18nContext";
import type { Currency } from "../types/expense";

interface TrendPoint {
  key: string;
  start: string;
  end: string;
  value: number;
  expenseCount: number;
  unit: "hour" | "day" | "month" | "year";
}

interface TrendChartProps {
  buckets: TrendPoint[];
  currency: Currency;
  locale: Locale;
  label: string;
}

function dateLabel(bucket: TrendPoint, locale: Locale, count: number) {
  const date = new Date(bucket.start);
  const language = locale === "ru" ? "ru-RU" : "en-US";
  if (bucket.unit === "hour") return new Intl.DateTimeFormat(language, { hour: "2-digit" }).format(date);
  if (bucket.unit === "month") return new Intl.DateTimeFormat(language, { month: "short" }).format(date).replace(".", "");
  if (bucket.unit === "year") return String(date.getFullYear());
  if (count === 7) return new Intl.DateTimeFormat(language, { weekday: "short" }).format(date).replace(".", "");
  return String(date.getDate());
}

function fullDateLabel(bucket: TrendPoint, locale: Locale) {
  const language = locale === "ru" ? "ru-RU" : "en-US";
  return new Intl.DateTimeFormat(language, bucket.unit === "hour"
    ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", year: "numeric" }).format(new Date(bucket.start));
}

function money(value: number, currency: Currency, locale: Locale, compact = false) {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 2,
  }).format(value);
}

export function TrendChart({ buckets, currency, locale, label }: TrendChartProps) {
  const chartRoot = useRef<HTMLDivElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const tooltipDate = useRef<HTMLParagraphElement>(null);
  const tooltipValue = useRef<HTMLElement>(null);
  const labels = useMemo(() => buckets.map((bucket) => ({
    axis: dateLabel(bucket, locale, buckets.length),
    full: fullDateLabel(bucket, locale),
  })), [buckets, locale]);
  const data = useMemo<uPlot.AlignedData>(() => [
    buckets.map((_, index) => index),
    buckets.map((bucket) => bucket.value),
  ], [buckets]);

  useLayoutEffect(() => {
    const root = chartRoot.current;
    if (!root || buckets.length === 0) return;

    const renderTooltip = (chart: uPlot) => {
      const index = chart.cursor.idx;
      const visible = index !== null && index !== undefined && buckets[index] !== undefined;
      if (!tooltip.current) return;
      tooltip.current.hidden = !visible;
      if (!visible) return;
      if (tooltipDate.current) tooltipDate.current.textContent = labels[index].full;
      if (tooltipValue.current) tooltipValue.current.textContent = money(buckets[index].value, currency, locale);
    };
    const width = Math.max(1, Math.floor(root.clientWidth));
    const height = Math.max(1, Math.floor(root.clientHeight));
    const chart = new uPlot({
      width,
      height,
      padding: [2, 2, 0, 0],
      legend: { show: false },
      cursor: {
        y: false,
        drag: { x: false, y: false },
        points: { fill: "#191a1c", size: 8, stroke: "#1677ff", width: 2 },
      },
      hooks: {
        setCursor: [renderTooltip],
      },
      scales: {
        x: {
          time: false,
          range: [-0.5, Math.max(0.5, buckets.length - 0.5)],
        },
        y: {
          range: (_chart, _minimum, maximum) => [0, maximum > 0 ? maximum * 1.08 : 1],
        },
      },
      axes: [
        {
          size: 22,
          gap: 6,
          space: 58,
          font: "10px system-ui, sans-serif",
          stroke: "rgba(255, 255, 255, 0.52)",
          grid: { show: false },
          ticks: { show: false },
          values: (_chart, splits) => splits.map((value) => labels[Math.round(value)]?.axis ?? ""),
        },
        {
          size: 48,
          gap: 8,
          space: 42,
          font: "10px system-ui, sans-serif",
          stroke: "rgba(255, 255, 255, 0.52)",
          grid: { show: true, stroke: "#292b2f", width: 1 },
          ticks: { show: false },
          values: (_chart, splits) => splits.map((value) => money(value, currency, locale, true)),
        },
      ],
      series: [
        {},
        {
          label,
          stroke: "#1677ff",
          fill: "rgba(22, 119, 255, 0.12)",
          width: 2.5,
          paths: uPlot.paths.spline?.(),
          points: {
            show: buckets.length <= 12,
            size: 5,
            width: 2,
            stroke: "#1677ff",
            fill: "#191a1c",
          },
        },
      ],
    }, data, root);

    const resizeObserver = new ResizeObserver(([entry]) => {
      const nextWidth = Math.max(1, Math.floor(entry.contentRect.width));
      const nextHeight = Math.max(1, Math.floor(entry.contentRect.height));
      if (nextWidth !== chart.width || nextHeight !== chart.height) chart.setSize({ width: nextWidth, height: nextHeight });
    });
    resizeObserver.observe(root);

    return () => {
      resizeObserver.disconnect();
      chart.destroy();
    };
  }, [buckets, currency, data, label, labels, locale]);

  return (
    <div className="chart" role="img" aria-label={label}>
      <div className="chart-canvas" ref={chartRoot} />
      <div className="chart-tooltip" ref={tooltip} hidden>
        <p ref={tooltipDate} />
        <span><i />{label}: <strong ref={tooltipValue} /></span>
      </div>
    </div>
  );
}
