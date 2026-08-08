import type { Locale } from "../../shared/i18n/i18nContext";
import type { CapitalValuation } from "./capitalTypes";

interface Props { values: CapitalValuation[]; locale: Locale; label: string }
const WIDTH_START = 8;
const WIDTH_END = 96;
const TOP = 12;
const BOTTOM = 116;

export function CapitalChart({ values, locale, label }: Props) {
  const sorted = [...values].sort((a, b) => a.date.localeCompare(b.date));
  const amounts = sorted.map((value) => Number(value.totalUsd));
  const min = Math.min(0, ...amounts);
  const max = Math.max(1, ...amounts) * 1.05;
  const span = max - min;
  const points = sorted.map((value, index) => ({ value, x: sorted.length === 1 ? 52 : WIDTH_START + index / (sorted.length - 1) * (WIDTH_END - WIDTH_START), y: TOP + (max - Number(value.totalUsd)) / span * (BOTTOM - TOP) }));
  const language = locale === "ru" ? "ru-RU" : "en-US";
  return <div className="chart"><svg height="154" width="100%" role="img" aria-label={label}><line className="chart-grid" x1={`${WIDTH_START}%`} x2={`${WIDTH_END}%`} y1={BOTTOM} y2={BOTTOM}/>{points.slice(1).map((point, index) => <line className="chart-line" key={point.value.date} x1={`${points[index].x}%`} y1={points[index].y} x2={`${point.x}%`} y2={point.y}/>)}{points.map((point, index) => <g key={point.value.date}><circle className="chart-point" cx={`${point.x}%`} cy={point.y} r="3"/>{(sorted.length <= 6 || index === 0 || index === sorted.length - 1) ? <text className="chart-date" x={`${point.x}%`} y={BOTTOM + 24} textAnchor="middle">{new Intl.DateTimeFormat(language, { day: "numeric", month: "short" }).format(new Date(`${point.value.date}T12:00:00`)).replace(".", "")}</text> : null}</g>)}</svg></div>;
}
