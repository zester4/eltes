"use client";

import { useTheme } from "next-themes";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartToolPayload } from "@/lib/ai/tools/render-chart";
import { cn } from "@/lib/utils";

const DEFAULT_SERIES_COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#14b8a6",
  "#a855f7",
  "#eab308",
] as const;

type ChartDisplayProps = {
  spec: ChartToolPayload;
  className?: string;
};

function useChartThemeColors() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return {
    grid: isDark ? "hsl(215 16% 22%)" : "hsl(214 32% 91%)",
    axis: isDark ? "hsl(215 14% 65%)" : "hsl(215 16% 40%)",
    tooltipBg: isDark ? "hsl(222 47% 11%)" : "hsl(0 0% 100%)",
    tooltipBorder: isDark ? "hsl(215 16% 28%)" : "hsl(214 32% 88%)",
    label: isDark ? "hsl(210 20% 88%)" : "hsl(222 47% 11%)",
  };
}

function pickSeriesColor(
  index: number,
  seriesColor: string | undefined,
  palette: string[] | undefined
): string {
  return (
    seriesColor ??
    palette?.[index] ??
    DEFAULT_SERIES_COLORS[index % DEFAULT_SERIES_COLORS.length]
  );
}

function buildRows(spec: ChartToolPayload) {
  return spec.labels.map((name, i) => {
    const row: Record<string, string | number> = { name };
    for (const s of spec.series) {
      row[s.name] = s.data[i] ?? 0;
    }
    return row;
  });
}

function buildRadarData(spec: ChartToolPayload) {
  return spec.labels.map((subject, i) => {
    const row: Record<string, string | number> = { subject };
    for (const s of spec.series) {
      row[s.name] = s.data[i] ?? 0;
    }
    return row;
  });
}

function buildPieData(spec: ChartToolPayload) {
  const s0 = spec.series[0];
  return spec.labels.map((name, i) => ({
    name,
    value: s0.data[i] ?? 0,
  }));
}

function buildScatterSeries(spec: ChartToolPayload): {
  key: string;
  name: string;
  color: string;
  points: { x: number; y: number; label: string }[];
}[] {
  const L = spec.labels.length;
  return spec.series.map((s, j) => ({
    key: s.name,
    name: s.name,
    color: pickSeriesColor(j, s.color, spec.colors),
    points: Array.from({ length: L }, (_, i) => ({
      x: i,
      y: s.data[i] ?? 0,
      label: spec.labels[i] ?? String(i),
    })),
  }));
}

export function ChartDisplay({ spec, className }: ChartDisplayProps) {
  const colors = useChartThemeColors();
  const rows = buildRows(spec);
  const radarData = buildRadarData(spec);
  const pieData = buildPieData(spec);
  const scatterSeries = buildScatterSeries(spec);

  const commonMargin = { top: 8, right: 8, left: 0, bottom: 8 };
  const xAxisTick = { fill: colors.axis, fontSize: 10 };
  const yAxisTick = { fill: colors.axis, fontSize: 10 };

  const tooltipContentStyle = {
    borderRadius: 8,
    border: `1px solid ${colors.tooltipBorder}`,
    background: colors.tooltipBg,
    color: colors.label,
    fontSize: 12,
    maxWidth: "min(92vw, 280px)",
  };

  const legendProps = {
    wrapperStyle: {
      fontSize: 11,
      paddingTop: 8,
      display: "flex",
      flexWrap: "wrap" as const,
      justifyContent: "center" as const,
      gap: 8,
    },
  };

  const chartInner = (() => {
    switch (spec.chartType) {
      case "line":
        return (
          <LineChart data={rows} margin={commonMargin}>
            <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              interval="preserveStartEnd"
              label={
                spec.xAxisLabel
                  ? {
                      value: spec.xAxisLabel,
                      position: "insideBottom",
                      offset: -2,
                      fill: colors.axis,
                      fontSize: 11,
                    }
                  : undefined
              }
              stroke={colors.axis}
              tick={xAxisTick}
              tickMargin={6}
            />
            <YAxis
              label={
                spec.yAxisLabel
                  ? {
                      value: spec.yAxisLabel,
                      angle: -90,
                      position: "insideLeft",
                      fill: colors.axis,
                      fontSize: 11,
                    }
                  : undefined
              }
              stroke={colors.axis}
              tick={yAxisTick}
              tickMargin={4}
              width={40}
            />
            <Tooltip contentStyle={tooltipContentStyle} />
            <Legend {...legendProps} />
            {spec.series.map((s, i) => (
              <Line
                dataKey={s.name}
                dot={{ r: 3 }}
                key={s.name}
                stroke={pickSeriesColor(i, s.color, spec.colors)}
                strokeWidth={2}
                type="monotone"
              />
            ))}
          </LineChart>
        );

      case "bar":
        return (
          <BarChart data={rows} margin={commonMargin}>
            <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              interval="preserveStartEnd"
              stroke={colors.axis}
              tick={xAxisTick}
              tickMargin={6}
            />
            <YAxis
              stroke={colors.axis}
              tick={yAxisTick}
              tickMargin={4}
              width={40}
            />
            <Tooltip contentStyle={tooltipContentStyle} />
            <Legend {...legendProps} />
            {spec.series.map((s, i) => (
              <Bar
                dataKey={s.name}
                fill={pickSeriesColor(i, s.color, spec.colors)}
                key={s.name}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        );

      case "area":
        return (
          <AreaChart data={rows} margin={commonMargin}>
            <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              interval="preserveStartEnd"
              stroke={colors.axis}
              tick={xAxisTick}
              tickMargin={6}
            />
            <YAxis
              stroke={colors.axis}
              tick={yAxisTick}
              tickMargin={4}
              width={40}
            />
            <Tooltip contentStyle={tooltipContentStyle} />
            <Legend {...legendProps} />
            {spec.series.map((s, i) => {
              const c = pickSeriesColor(i, s.color, spec.colors);
              return (
                <Area
                  dataKey={s.name}
                  fill={c}
                  fillOpacity={0.35}
                  key={s.name}
                  stroke={c}
                  type="monotone"
                />
              );
            })}
          </AreaChart>
        );

      case "pie":
        return (
          <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Pie
              cx="50%"
              cy="50%"
              data={pieData}
              dataKey="value"
              innerRadius="42%"
              label={({ name, percent }) =>
                `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
              }
              labelLine={{ stroke: colors.axis }}
              nameKey="name"
              outerRadius="72%"
              paddingAngle={2}
            >
              {pieData.map((entry, index) => (
                <Cell
                  fill={pickSeriesColor(index, undefined, spec.colors)}
                  key={entry.name}
                />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipContentStyle} />
            <Legend {...legendProps} />
          </PieChart>
        );

      case "radar":
        return (
          <RadarChart data={radarData} margin={commonMargin}>
            <PolarGrid stroke={colors.grid} />
            <PolarAngleAxis
              dataKey="subject"
              stroke={colors.axis}
              tick={{ fill: colors.axis, fontSize: 10 }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, "auto"]}
              stroke={colors.axis}
              tick={{ fill: colors.axis, fontSize: 9 }}
            />
            <Tooltip contentStyle={tooltipContentStyle} />
            <Legend {...legendProps} />
            {spec.series.map((s, i) => (
              <Radar
                dataKey={s.name}
                fill={pickSeriesColor(i, s.color, spec.colors)}
                fillOpacity={0.35}
                key={s.name}
                stroke={pickSeriesColor(i, s.color, spec.colors)}
                strokeWidth={2}
              />
            ))}
          </RadarChart>
        );

      case "scatter":
        return (
          <ScatterChart margin={{ top: 8, right: 12, bottom: 24, left: 8 }}>
            <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
            <XAxis
              domain={[0, Math.max(spec.labels.length - 1, 0)]}
              stroke={colors.axis}
              tick={{ ...xAxisTick }}
              tickFormatter={(v) => spec.labels[v as number] ?? ""}
              type="number"
            />
            <YAxis
              stroke={colors.axis}
              tick={yAxisTick}
              tickMargin={4}
              width={40}
            />
            <Tooltip contentStyle={tooltipContentStyle} />
            <Legend {...legendProps} />
            {scatterSeries.map((ss) => (
              <Scatter
                data={ss.points}
                dataKey="y"
                fill={ss.color}
                key={ss.key}
                name={ss.name}
              />
            ))}
          </ScatterChart>
        );

      case "composed": {
        const kinds = spec.seriesKinds ?? [];
        return (
          <ComposedChart data={rows} margin={commonMargin}>
            <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              interval="preserveStartEnd"
              stroke={colors.axis}
              tick={xAxisTick}
              tickMargin={6}
            />
            <YAxis
              stroke={colors.axis}
              tick={yAxisTick}
              tickMargin={4}
              width={40}
            />
            <Tooltip contentStyle={tooltipContentStyle} />
            <Legend {...legendProps} />
            {spec.series.map((s, i) => {
              const c = pickSeriesColor(i, s.color, spec.colors);
              const kind = kinds[i] ?? "bar";
              if (kind === "line") {
                return (
                  <Line
                    dataKey={s.name}
                    dot={false}
                    key={s.name}
                    stroke={c}
                    strokeWidth={2}
                    type="monotone"
                  />
                );
              }
              if (kind === "area") {
                return (
                  <Area
                    dataKey={s.name}
                    fill={c}
                    fillOpacity={0.3}
                    key={s.name}
                    stroke={c}
                    type="monotone"
                  />
                );
              }
              return (
                <Bar
                  dataKey={s.name}
                  fill={c}
                  key={s.name}
                  radius={[3, 3, 0, 0]}
                />
              );
            })}
          </ComposedChart>
        );
      }

      default:
        return null;
    }
  })();

  return (
    <div
      className={cn(
        "not-prose w-full overflow-hidden rounded-xl border border-border/60 bg-card/80 p-2 shadow-sm backdrop-blur-sm sm:p-3",
        className
      )}
    >
      {spec.title ? (
        <h3 className="mb-1 px-1 font-semibold text-foreground text-sm sm:text-base">
          {spec.title}
        </h3>
      ) : null}
      {spec.description ? (
        <p className="mb-2 px-1 text-muted-foreground text-xs sm:text-sm">
          {spec.description}
        </p>
      ) : null}
      <div className="h-[260px] w-full overflow-hidden sm:h-[300px] md:h-[min(52vh,340px)] md:min-h-[280px]">
        <ResponsiveContainer height="100%" width="100%">
          {chartInner}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
