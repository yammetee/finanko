import Card from "antd/es/card";
import Empty from "antd/es/empty";
import { memo, useMemo } from "react";
import { getCategoryNameById } from "../../../shared/i18n/displayText";
import { useI18n } from "../../../shared/i18n/i18nContext";
import type { Currency, Timeframe } from "../../../shared/types/finance";

interface TrendPoint {
  label: string;
  income: number;
  expenses: number;
}

interface NetWorthPoint {
  label: string;
  netWorth: number;
}

interface CategoryPoint {
  id: string;
  name: string;
  value: number;
  fill: string;
}

interface DashboardChartsProps {
  trend: TrendPoint[];
  netWorthTrend: NetWorthPoint[];
  byCategory: CategoryPoint[];
  timeframe: Timeframe;
  currency: Currency;
}

const SVG_WIDTH = 640;
const SVG_HEIGHT = 360;
const PADDING = { top: 12, right: 12, bottom: 42, left: 58 };
const INNER_WIDTH = SVG_WIDTH - PADDING.left - PADDING.right;
const INNER_HEIGHT = SVG_HEIGHT - PADDING.top - PADDING.bottom;

function formatAxis(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1000) return `${Math.round(value / 100) / 10}k`;
  return `${Math.round(value)}`;
}

function getRange(values: number[]) {
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  if (min === max) return { min: min - 1, max: max + 1 };
  const padding = (max - min) * 0.08;
  return { min: min - padding, max: max + padding };
}

function yFor(value: number, min: number, max: number) {
  return PADDING.top + ((max - value) / (max - min)) * INNER_HEIGHT;
}

function xFor(index: number, length: number) {
  if (length <= 1) return PADDING.left + INNER_WIDTH / 2;
  return PADDING.left + (index / (length - 1)) * INNER_WIDTH;
}

function labelIndexes(length: number) {
  if (length <= 7) return new Set(Array.from({ length }, (_, index) => index));
  const indexes = new Set<number>();
  const last = length - 1;
  for (let index = 0; index <= 5; index += 1) {
    indexes.add(Math.round((last * index) / 5));
  }
  return indexes;
}

function gridLines(min: number, max: number) {
  return Array.from({ length: 5 }, (_, index) => min + ((max - min) * index) / 4);
}

function linePath(values: number[], min: number, max: number) {
  return values
    .map((value, index) => `${index === 0 ? "M" : "L"} ${xFor(index, values.length)} ${yFor(value, min, max)}`)
    .join(" ");
}

function SingleBarChart({ data }: { data: NetWorthPoint[] }) {
  const values = data.map((point) => point.netWorth);
  const { min, max } = getRange(values);
  const zeroY = yFor(0, min, max);
  const labels = labelIndexes(data.length);
  const step = INNER_WIDTH / Math.max(data.length, 1);
  const barWidth = Math.max(6, Math.min(28, step * 0.58));

  return (
    <svg className="chart-svg" viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} role="img">
      {gridLines(min, max).map((value) => {
        const y = yFor(value, min, max);
        return (
          <g key={value}>
            <line className="chart-grid-line" x1={PADDING.left} x2={SVG_WIDTH - PADDING.right} y1={y} y2={y} />
            <text className="chart-axis-label" x={PADDING.left - 12} y={y + 4} textAnchor="end">
              {formatAxis(value)}
            </text>
          </g>
        );
      })}
      <line className="chart-axis-line" x1={PADDING.left} x2={SVG_WIDTH - PADDING.right} y1={zeroY} y2={zeroY} />
      {data.map((point, index) => {
        const x = PADDING.left + step * index + step / 2 - barWidth / 2;
        const y = yFor(point.netWorth, min, max);
        const height = Math.max(2, Math.abs(zeroY - y));
        return (
          <rect
            key={`${point.label}-${index}`}
            className="chart-bar chart-bar-primary"
            x={x}
            y={Math.min(y, zeroY)}
            width={barWidth}
            height={height}
            rx={5}
          />
        );
      })}
      {data.map((point, index) =>
        labels.has(index) ? (
          <text key={point.label} className="chart-axis-label" x={xFor(index, data.length)} y={SVG_HEIGHT - 13} textAnchor="middle">
            {point.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

function SingleLineChart({ data }: { data: NetWorthPoint[] }) {
  const values = data.map((point) => point.netWorth);
  const { min, max } = getRange(values);
  const labels = labelIndexes(data.length);

  return (
    <svg className="chart-svg" viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} role="img">
      {gridLines(min, max).map((value) => {
        const y = yFor(value, min, max);
        return (
          <g key={value}>
            <line className="chart-grid-line" x1={PADDING.left} x2={SVG_WIDTH - PADDING.right} y1={y} y2={y} />
            <text className="chart-axis-label" x={PADDING.left - 12} y={y + 4} textAnchor="end">
              {formatAxis(value)}
            </text>
          </g>
        );
      })}
      <path className="chart-line chart-line-primary" d={linePath(values, min, max)} />
      {data.map((point, index) =>
        labels.has(index) ? (
          <text key={point.label} className="chart-axis-label" x={xFor(index, data.length)} y={SVG_HEIGHT - 13} textAnchor="middle">
            {point.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

function IncomeExpenseChart({ data, timeframe }: { data: TrendPoint[]; timeframe: Timeframe }) {
  const values = data.flatMap((point) => [point.income, point.expenses]);
  const { min, max } = getRange(values);
  const labels = labelIndexes(data.length);
  const step = INNER_WIDTH / Math.max(data.length, 1);
  const barWidth = Math.max(4, Math.min(16, step * 0.26));

  if (timeframe === "all") {
    return (
      <svg className="chart-svg" viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} role="img">
        {gridLines(min, max).map((value) => {
          const y = yFor(value, min, max);
          return (
            <g key={value}>
              <line className="chart-grid-line" x1={PADDING.left} x2={SVG_WIDTH - PADDING.right} y1={y} y2={y} />
              <text className="chart-axis-label" x={PADDING.left - 12} y={y + 4} textAnchor="end">
                {formatAxis(value)}
              </text>
            </g>
          );
        })}
        <path className="chart-line chart-line-income" d={linePath(data.map((point) => point.income), min, max)} />
        <path className="chart-line chart-line-expense" d={linePath(data.map((point) => point.expenses), min, max)} />
        {data.map((point, index) =>
          labels.has(index) ? (
            <text key={point.label} className="chart-axis-label" x={xFor(index, data.length)} y={SVG_HEIGHT - 13} textAnchor="middle">
              {point.label}
            </text>
          ) : null,
        )}
      </svg>
    );
  }

  return (
    <svg className="chart-svg" viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} role="img">
      {gridLines(min, max).map((value) => {
        const y = yFor(value, min, max);
        return (
          <g key={value}>
            <line className="chart-grid-line" x1={PADDING.left} x2={SVG_WIDTH - PADDING.right} y1={y} y2={y} />
            <text className="chart-axis-label" x={PADDING.left - 12} y={y + 4} textAnchor="end">
              {formatAxis(value)}
            </text>
          </g>
        );
      })}
      {data.map((point, index) => {
        const x = PADDING.left + step * index + step / 2;
        const incomeY = yFor(point.income, min, max);
        const expensesY = yFor(point.expenses, min, max);
        const zeroY = yFor(0, min, max);
        return (
          <g key={`${point.label}-${index}`}>
            <rect className="chart-bar chart-bar-income" x={x - barWidth - 1} y={incomeY} width={barWidth} height={Math.max(2, zeroY - incomeY)} rx={5} />
            <rect className="chart-bar chart-bar-expense" x={x + 1} y={expensesY} width={barWidth} height={Math.max(2, zeroY - expensesY)} rx={5} />
          </g>
        );
      })}
      {data.map((point, index) =>
        labels.has(index) ? (
          <text key={point.label} className="chart-axis-label" x={xFor(index, data.length)} y={SVG_HEIGHT - 13} textAnchor="middle">
            {point.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

function DonutChart({ data }: { data: CategoryPoint[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const radius = 82;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg className="chart-svg chart-donut-svg" viewBox="0 0 300 300" role="img">
      <circle className="chart-donut-track" cx="150" cy="150" r={radius} />
      {data.map((item) => {
        const length = total > 0 ? (item.value / total) * circumference : 0;
        const strokeDasharray = `${length} ${circumference - length}`;
        const strokeDashoffset = -offset;
        offset += length;
        return (
          <circle
            key={item.id}
            className="chart-donut-segment"
            cx="150"
            cy="150"
            r={radius}
            stroke={item.fill}
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
          >
            <title>{item.name}</title>
          </circle>
        );
      })}
    </svg>
  );
}

export const DashboardCharts = memo(function DashboardCharts({
  trend,
  netWorthTrend,
  byCategory,
  timeframe,
  currency,
}: DashboardChartsProps) {
  const { t } = useI18n();
  const localizedCategories = useMemo(
    () =>
      byCategory.map((category) => ({
        ...category,
        name: getCategoryNameById(category.id, category.name, t),
      })),
    [byCategory, t],
  );

  return (
    <>
      <Card className="span-6" title={t("section.portfolioNetWorth")}>
        <div className="chart chart-tall" aria-label={`${currency} ${t("section.portfolioNetWorth")}`}>
          {timeframe === "all" ? (
            <SingleLineChart data={netWorthTrend} />
          ) : (
            <SingleBarChart data={netWorthTrend} />
          )}
        </div>
      </Card>

      <Card className="span-6" title={t("section.incomeVsExpenses")}>
        <div className="chart chart-tall" aria-label={`${currency} ${t("section.incomeVsExpenses")}`}>
          <IncomeExpenseChart data={trend} timeframe={timeframe} />
        </div>
      </Card>

      <Card className="span-6" title={t("section.expensesByCategory")}>
        {localizedCategories.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("empty.noExpenses")} />
        ) : (
          <div className="chart chart-tall" aria-label={`${currency} ${t("section.expensesByCategory")}`}>
            <DonutChart data={localizedCategories} />
          </div>
        )}
      </Card>
    </>
  );
});
