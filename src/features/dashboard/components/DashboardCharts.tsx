import { Card, Empty } from "antd";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useI18n } from "../../../shared/i18n/i18nContext";
import { getCategoryNameById } from "../../../shared/i18n/displayText";
import type { Currency, Timeframe } from "../../../shared/types/finance";
import { ChartTooltip } from "./ChartTooltip";

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

export function DashboardCharts({
  trend,
  netWorthTrend,
  byCategory,
  timeframe,
  currency,
}: DashboardChartsProps) {
  const { t } = useI18n();
  const localizedCategories = byCategory.map((category) => ({
    ...category,
    name: getCategoryNameById(category.id, category.name, t),
  }));

  return (
    <>
      <Card className="span-6" title={t("section.portfolioNetWorth")}>
        <div className="chart chart-tall">
          <ResponsiveContainer width="100%" height="100%">
            {timeframe === "all" ? (
              <LineChart data={netWorthTrend}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--color-muted)" />
                <YAxis stroke="var(--color-muted)" />
                <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ stroke: "var(--color-border-strong)" }} />
                <Line
                  type="monotone"
                  dataKey="netWorth"
                  stroke="var(--color-primary)"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            ) : (
              <BarChart data={netWorthTrend}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--color-muted)" />
                <YAxis stroke="var(--color-muted)" />
                <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ fill: "rgba(111, 191, 230, 0.06)" }} />
                <Bar dataKey="netWorth" fill="var(--color-primary)" radius={[5, 5, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="span-6" title={t("section.incomeVsExpenses")}>
        <div className="chart chart-tall">
          <ResponsiveContainer width="100%" height="100%">
            {timeframe === "all" ? (
              <LineChart data={trend}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--color-muted)" />
                <YAxis stroke="var(--color-muted)" />
                <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ stroke: "var(--color-border-strong)" }} />
                <Line type="monotone" dataKey="income" stroke="var(--color-income)" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="expenses" stroke="var(--color-expense)" strokeWidth={2.5} dot={false} />
              </LineChart>
            ) : (
              <BarChart data={trend}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--color-muted)" />
                <YAxis stroke="var(--color-muted)" />
                <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ fill: "rgba(255, 255, 255, 0.035)" }} />
                <Bar dataKey="income" fill="var(--color-income)" radius={[5, 5, 0, 0]} />
                <Bar dataKey="expenses" fill="var(--color-expense)" radius={[5, 5, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="span-6" title={t("section.expensesByCategory")}>
        {localizedCategories.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("empty.noExpenses")} />
        ) : (
          <div className="chart chart-tall">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={localizedCategories} dataKey="value" nameKey="name" innerRadius={64}>
                  {localizedCategories.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip currency={currency} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </>
  );
}
