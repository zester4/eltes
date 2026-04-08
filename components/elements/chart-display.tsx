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
  RadialBarChart,
  RadialBar,
  FunnelChart,
  Funnel,
  LabelList,
} from "recharts";
import type { ChartToolPayload } from "@/lib/ai/tools/render-chart";
import { cn } from "@/lib/utils";

const DEFAULT_SERIES_COLORS = [
  "hsl(158 94% 30%)", // Emerald
  "hsl(262 83% 58%)", // Violet
  "hsl(38 92% 50%)",  // Amber
  "hsl(346 87% 43%)", // Rose
  "hsl(189 94% 43%)", // Cyan
  "hsl(239 84% 67%)", // Indigo
  "hsl(292 84% 61%)", // Fuchsia
  "hsl(84 81% 44%)",  // Lime
  "hsl(199 89% 48%)", // Sky
  "hsl(174 86% 29%)", // Teal
  "hsl(322 81% 54%)", // Pink
  "hsl(217 91% 60%)", // Blue-Grey
  "hsl(31 97% 55%)",  // Orange
  "hsl(271 91% 65%)", // Purple
  "hsl(142 71% 45%)", // Green
  "hsl(11 80% 45%)",  // Crimson
] as const;

type ChartDisplayProps = {
  spec: ChartToolPayload;
  className?: string;
};

function useChartThemeColors() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return {
    grid: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)",
    axis: isDark ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.4)",
    tooltipBg: isDark ? "rgba(10, 10, 10, 0.8)" : "rgba(255, 255, 255, 0.9)",
    tooltipBorder: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)",
    label: isDark ? "rgba(255, 255, 255, 0.9)" : "rgba(0, 0, 0, 0.9)",
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
    fill: pickSeriesColor(i, undefined, spec.colors)
  }));
}

function buildFunnelData(spec: ChartToolPayload) {
  const s0 = spec.series[0];
  return spec.labels.map((name, i) => ({
    name,
    value: s0.data[i] ?? 0,
    fill: pickSeriesColor(i, undefined, spec.colors)
  }));
}

const formatValue = (value: any, formatterType?: "currency" | "percent" | "compact" | "none") => {
  if (typeof value !== "number") return value;
  switch (formatterType) {
    case "currency":
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
    case "percent":
      return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(value / 100);
    case "compact":
      return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
    default:
      return value.toLocaleString("en-US");
  }
};

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
  const funnelData = spec.chartType === "funnel" ? buildFunnelData(spec) : [];
  const radialData = spec.chartType === "radial" ? buildPieData(spec) : [];

  const commonMargin = { top: 8, right: 8, left: 0, bottom: 8 };
  const xAxisTick = { fill: colors.axis, fontSize: 10 };
  const yAxisTick = { fill: colors.axis, fontSize: 10 };

  const tooltipContentStyle = {
    borderRadius: 12,
    border: `1px solid ${colors.tooltipBorder}`,
    background: colors.tooltipBg,
    backdropFilter: "blur(12px)",
    color: colors.label,
    fontSize: 12,
    padding: "8px 12px",
    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
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

  const isHorizontal = spec.layout === "horizontal";
  const stacking = spec.stacked ? "1" : undefined;

  const xAxisProps = {
    dataKey: isHorizontal ? undefined : "name",
    stroke: colors.grid,
    tick: { fill: colors.axis, fontSize: 10 },
    tickLine: { stroke: colors.grid },
    axisLine: { stroke: colors.grid },
    type: (isHorizontal ? "number" : "category") as "number" | "category",
  };

  const yAxisProps = {
    stroke: colors.grid,
    tick: { fill: colors.axis, fontSize: 10 },
    tickLine: { stroke: colors.grid },
    axisLine: { stroke: colors.grid },
    width: isHorizontal ? 80 : 40,
    type: (isHorizontal ? "category" : "number") as "number" | "category",
    dataKey: isHorizontal ? "name" : undefined,
    tickFormatter: (val: any) => formatValue(val, isHorizontal ? "none" : spec.valueFormatter),
  };

  const chartInner = (() => {
    switch (spec.chartType) {
      case "line":
        return (
          <LineChart data={rows} layout={spec.layout} margin={commonMargin}>
            <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={isHorizontal} horizontal={!isHorizontal} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip 
              contentStyle={tooltipContentStyle} 
              formatter={(value: any) => formatValue(value, spec.valueFormatter)}
              cursor={{ stroke: colors.grid, strokeWidth: 1 }}
            />
            <Legend {...legendProps} />
            <defs>
              {spec.series.map((s, i) => {
                const c = pickSeriesColor(i, s.color, spec.colors);
                return (
                  <linearGradient id={`lineGradient-${i}`} key={i} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={c} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={c} stopOpacity={0}/>
                  </linearGradient>
                )
              })}
            </defs>
            {spec.series.map((s, i) => (
              <Line
                dataKey={s.name}
                dot={{ r: 3, fill: pickSeriesColor(i, s.color, spec.colors), strokeWidth: 2, stroke: "#000" }}
                activeDot={{ r: 5, strokeWidth: 0 }}
                key={s.name}
                stroke={pickSeriesColor(i, s.color, spec.colors)}
                strokeWidth={3}
                strokeDasharray={s.lineStyle === "dashed" ? "5 5" : undefined}
                type="natural"
                animationDuration={1500}
              />
            ))}
          </LineChart>
        );

      case "bar":
        return (
          <BarChart data={rows} layout={spec.layout} margin={commonMargin}>
            <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={isHorizontal} horizontal={!isHorizontal} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip 
              contentStyle={tooltipContentStyle} 
              formatter={(value: any) => formatValue(value, spec.valueFormatter)}
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
            />
            <Legend {...legendProps} />
            <defs>
              {spec.series.map((s, i) => {
                const c = pickSeriesColor(i, s.color, spec.colors);
                return (
                  <linearGradient id={`barGradient-${i}`} key={i} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c} stopOpacity={1}/>
                    <stop offset="100%" stopColor={c} stopOpacity={0.6}/>
                  </linearGradient>
                )
              })}
            </defs>
            {spec.series.map((s, i) => (
              <Bar
                dataKey={s.name}
                fill={`url(#barGradient-${i})`}
                key={s.name}
                radius={isHorizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]}
                stackId={stacking}
                animationDuration={1500}
              />
            ))}
          </BarChart>
        );

      case "area":
        return (
          <AreaChart data={rows} layout={spec.layout} margin={commonMargin}>
            <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={isHorizontal} horizontal={!isHorizontal} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip 
              contentStyle={tooltipContentStyle}
              formatter={(value: any) => formatValue(value, spec.valueFormatter)}
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
            />
            <Legend {...legendProps} />
            <defs>
              {spec.series.map((s, i) => {
                const c = pickSeriesColor(i, s.color, spec.colors);
                return (
                  <linearGradient id={`areaGradient-${i}`} key={i} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={c} stopOpacity={0.4}/>
                    <stop offset="95%" stopColor={c} stopOpacity={0}/>
                  </linearGradient>
                )
              })}
            </defs>
            {spec.series.map((s, i) => {
              const c = pickSeriesColor(i, s.color, spec.colors);
              return (
                <Area
                  dataKey={s.name}
                  fill={`url(#areaGradient-${i})`}
                  key={s.name}
                  stroke={c}
                  strokeWidth={2}
                  stackId={stacking}
                  type="natural"
                  animationDuration={1500}
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
            <Tooltip contentStyle={tooltipContentStyle} formatter={(value: any) => formatValue(value, spec.valueFormatter)} />
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
            <Tooltip contentStyle={tooltipContentStyle} formatter={(value: any) => formatValue(value, spec.valueFormatter)} />
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
            <Tooltip contentStyle={tooltipContentStyle} formatter={(value: any) => formatValue(value, spec.valueFormatter)} />
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
            <Tooltip contentStyle={tooltipContentStyle} formatter={(value: any) => formatValue(value, spec.valueFormatter)} />
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
                    type="natural"
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
                    type="natural"
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

      case "radial":
        return (
          <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="80%" barSize={16} data={radialData}>
            <PolarAngleAxis type="number" domain={[0, 'dataMax']} angleAxisId={0} tick={false} />
            <RadialBar
              background={{ fill: colors.grid }}
              dataKey="value"
              cornerRadius={8}
            >
              {radialData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </RadialBar>
            <Legend {...legendProps} />
            <Tooltip contentStyle={tooltipContentStyle} formatter={(value: any) => formatValue(value, spec.valueFormatter)} />
          </RadialBarChart>
        );

      case "funnel":
        return (
          <FunnelChart margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
            <Tooltip contentStyle={tooltipContentStyle} formatter={(value: any) => formatValue(value, spec.valueFormatter)} />
            <Funnel dataKey="value" data={funnelData} isAnimationActive>
              <LabelList position="right" fill={colors.axis} stroke="none" dataKey="name" fontSize={12} />
              {funnelData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Funnel>
          </FunnelChart>
        );

      default:
        return null;
    }
  })();

  return (
    <div
      className={cn(
        "not-prose w-full overflow-hidden rounded-xl bg-transparent p-1 sm:p-2",
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
        <ResponsiveContainer height="100%" width="100%" minWidth={1} minHeight={1}>
          {chartInner}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
