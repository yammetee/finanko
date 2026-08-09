import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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

interface ChartPoint extends TrendPoint {
  axisLabel: string;
  tooltipLabel: string;
  x: number;
  y: number;
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

function round(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

function sign(value: number) {
  return value < 0 ? -1 : 1;
}

function monotonePath(points: ChartPoint[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${round(points[0].x)},${round(points[0].y)}`;
  if (points.length === 2) return `M${round(points[0].x)},${round(points[0].y)}L${round(points[1].x)},${round(points[1].y)}`;

  const segmentSlopes = points.slice(1).map((point, index) => {
    const previous = points[index];
    return (point.y - previous.y) / (point.x - previous.x);
  });
  const tangents = new Array<number>(points.length);
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    const next = points[index + 1];
    const leftWidth = point.x - previous.x;
    const rightWidth = next.x - point.x;
    const leftSlope = segmentSlopes[index - 1];
    const rightSlope = segmentSlopes[index];
    const weighted = (leftSlope * rightWidth + rightSlope * leftWidth) / (leftWidth + rightWidth);
    tangents[index] = (sign(leftSlope) + sign(rightSlope)) * Math.min(Math.abs(leftSlope), Math.abs(rightSlope), Math.abs(weighted) / 2) || 0;
  }
  tangents[0] = (3 * segmentSlopes[0] - tangents[1]) / 2;
  tangents[points.length - 1] = (3 * segmentSlopes[segmentSlopes.length - 1] - tangents[points.length - 2]) / 2;

  let path = `M${round(points[0].x)},${round(points[0].y)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const point = points[index];
    const next = points[index + 1];
    const deltaX = (next.x - point.x) / 3;
    path += `C${round(point.x + deltaX)},${round(point.y + deltaX * tangents[index])},${round(next.x - deltaX)},${round(next.y - deltaX * tangents[index + 1])},${round(next.x)},${round(next.y)}`;
  }
  return path;
}

function linearTicks(maximum: number, count = 5) {
  if (!(maximum > 0)) return [0];
  const roughStep = maximum / count;
  const power = Math.floor(Math.log10(roughStep));
  const magnitude = 10 ** power;
  const error = roughStep / magnitude;
  const factor = error >= Math.sqrt(50) ? 10 : error >= Math.sqrt(10) ? 5 : error >= Math.sqrt(2) ? 2 : 1;
  const step = factor * magnitude;
  const ticks: number[] = [];
  for (let value = 0; value <= maximum + step * 0.001; value += step) ticks.push(round(value));
  if (ticks[ticks.length - 1] < maximum) ticks.push(round(ticks[ticks.length - 1] + step));
  return ticks;
}

export function TrendChart({ buckets, currency, locale, label }: TrendChartProps) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: 220 });
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const update = () => {
      const next = { width: Math.max(element.clientWidth, 1), height: Math.max(element.clientHeight, 1) };
      setSize((current) => current.width === next.width && current.height === next.height ? current : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    const left = 48;
    const right = 2;
    const top = 10;
    const bottom = 22;
    const plotWidth = Math.max(size.width - left - right, 1);
    const plotHeight = Math.max(size.height - top - bottom, 1);
    const maximum = Math.max(0, ...buckets.map((bucket) => bucket.value));
    const ticks = linearTicks(maximum);
    const scaleMaximum = ticks[ticks.length - 1] || 1;
    const points: ChartPoint[] = buckets.map((bucket, index) => ({
      ...bucket,
      axisLabel: dateLabel(bucket, locale, buckets.length),
      tooltipLabel: fullDateLabel(bucket, locale),
      x: left + (index + 0.5) / Math.max(buckets.length, 1) * plotWidth,
      y: top + (scaleMaximum - bucket.value) / scaleMaximum * plotHeight,
    }));
    const line = monotonePath(points);
    const baseline = top + plotHeight;
    const area = points.length > 0 ? `${line}L${round(points[points.length - 1].x)},${round(baseline)}L${round(points[0].x)},${round(baseline)}Z` : "";
    return { area, baseline, left, line, maximum: scaleMaximum, plotWidth, points, right, ticks, top };
  }, [buckets, locale, size]);

  const activePoint = activeIndex === null ? undefined : geometry.points[activeIndex];
  const labelStep = Math.max(1, Math.ceil(buckets.length / Math.max(2, Math.floor(geometry.plotWidth / 58))));
  const showLabel = (index: number) => index === 0 || index === buckets.length - 1 || index % labelStep === 0;
  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (geometry.points.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(rect.width - geometry.right, Math.max(geometry.left, event.clientX - rect.left));
    const ratio = geometry.plotWidth > 0 ? (x - geometry.left) / geometry.plotWidth : 0;
    setActiveIndex(Math.min(geometry.points.length - 1, Math.max(0, Math.round(ratio * geometry.points.length - 0.5))));
  };

  return (
    <div className="chart" ref={container} role="img" aria-label={label}>
      <svg aria-hidden="true" height="100%" viewBox={`0 0 ${size.width} ${size.height}`} width="100%" onPointerLeave={() => setActiveIndex(null)} onPointerMove={handlePointerMove}>
        {geometry.ticks.map((value) => {
          const y = geometry.top + (geometry.maximum - value) / geometry.maximum * (geometry.baseline - geometry.top);
          return (
            <g className="chart-grid" key={value}>
              <line x1={geometry.left} x2={size.width - geometry.right} y1={y} y2={y} />
              <text dominantBaseline="middle" textAnchor="end" x={geometry.left - 8} y={y}>{money(value, currency, locale, true)}</text>
            </g>
          );
        })}
        {geometry.area ? <path className="chart-area" d={geometry.area} /> : null}
        {geometry.line ? <path className="chart-line" d={geometry.line} /> : null}
        {activePoint ? <line className="chart-cursor" x1={activePoint.x} x2={activePoint.x} y1={geometry.top} y2={geometry.baseline} /> : null}
        {geometry.points.map((point, index) => (
          <g key={point.key}>
            {buckets.length <= 12 || index === activeIndex ? <circle className="chart-point" cx={point.x} cy={point.y} r={index === activeIndex ? 4 : 2.5} /> : null}
            {showLabel(index) ? <text className="chart-date" dominantBaseline="hanging" textAnchor="middle" x={point.x} y={geometry.baseline + 6}>{point.axisLabel}</text> : null}
          </g>
        ))}
      </svg>
      {activePoint ? (
        <div className="chart-tooltip" style={{ left: activePoint.x > size.width - 170 ? activePoint.x - 10 : activePoint.x + 10, top: Math.min(geometry.baseline - 8, Math.max(8, activePoint.y)), transform: `translate(${activePoint.x > size.width - 170 ? "-100%" : "0"}, -50%)` }}>
          <p>{activePoint.tooltipLabel}</p>
          <span><i />{label} : <strong>{money(activePoint.value, currency, locale)}</strong></span>
        </div>
      ) : null}
    </div>
  );
}
