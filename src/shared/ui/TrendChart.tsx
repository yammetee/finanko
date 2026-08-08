import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
  const data = buckets.map((bucket) => ({
    ...bucket,
    axisLabel: dateLabel(bucket, locale, buckets.length),
    tooltipLabel: fullDateLabel(bucket, locale),
  }));
  const showDots = data.length <= 12;

  return <div className="chart" role="img" aria-label={label}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <AreaChart accessibilityLayer data={data} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)"/>
        <XAxis dataKey="axisLabel" axisLine={false} tickLine={false} height={22} minTickGap={18} tick={{ fill: "var(--text-muted)", fontSize: 10 }}/>
        <YAxis axisLine={false} tickLine={false} width={48} domain={[0, "auto"]} tickFormatter={(value: number) => money(value, currency, locale, true)} tick={{ fill: "var(--text-muted)", fontSize: 10 }}/>
        <Tooltip cursor={{ stroke: "var(--border-strong)" }} labelFormatter={(_, payload) => payload[0]?.payload.tooltipLabel ?? ""} formatter={(value) => [money(Number(value), currency, locale), label]} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text)", fontSize: 12 }} itemStyle={{ color: "var(--text)" }} labelStyle={{ color: "var(--text-secondary)", marginBottom: 4 }}/>
        <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2.5} fill="var(--primary)" fillOpacity={0.12} dot={showDots ? { r: 2.5, fill: "var(--surface)", stroke: "var(--primary)", strokeWidth: 2 } : false} activeDot={{ r: 4, fill: "var(--surface)", stroke: "var(--primary)", strokeWidth: 2 }} isAnimationActive={false}/>
      </AreaChart>
    </ResponsiveContainer>
  </div>;
}
