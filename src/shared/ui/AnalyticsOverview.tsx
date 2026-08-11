import { lazy, Suspense, type ReactNode } from "react";
import type { Locale } from "../i18n/i18nContext";
import type { Currency } from "../types/expense";
import type { TrendPoint } from "./TrendChart";

const TrendChart = lazy(() => import("./TrendChart").then((module) => ({ default: module.TrendChart })));

interface AnalyticsOverviewProps {
  buckets: TrendPoint[];
  currency: Currency;
  locale: Locale;
  chartTitle: string;
  chartLabel: string;
  chartReady?: boolean;
  breakdownTitle: string;
  children: ReactNode;
}

export function AnalyticsOverview({ buckets, currency, locale, chartTitle, chartLabel, chartReady = true, breakdownTitle, children }: AnalyticsOverviewProps) {
  return (
    <div className="analytics-grid">
      <section className="panel chart-panel">
        <h2>{chartTitle}</h2>
        {chartReady ? <Suspense fallback={<div className="chart" aria-hidden="true" />}><TrendChart buckets={buckets} currency={currency} locale={locale} label={chartLabel} /></Suspense> : <div className="chart" aria-hidden="true" />}
      </section>
      <section className="panel category-panel">
        <h2>{breakdownTitle}</h2>
        {children}
      </section>
    </div>
  );
}
