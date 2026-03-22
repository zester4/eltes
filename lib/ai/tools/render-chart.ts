import { tool } from "ai";
import { z } from "zod";

const chartSeriesSchema = z.object({
  name: z.string().min(1),
  data: z.array(z.number()),
  color: z.string().optional(),
});

export const chartToolInputSchema = z.object({
  chartType: z.enum([
    "line",
    "bar",
    "area",
    "pie",
    "radar",
    "scatter",
    "composed",
  ]),
  title: z.string().optional(),
  description: z.string().optional(),
  labels: z.array(z.string()).min(1).max(64),
  series: z.array(chartSeriesSchema).min(1).max(12),
  xAxisLabel: z.string().optional(),
  yAxisLabel: z.string().optional(),
  /** Optional palette (hex or CSS colors), applied to series in order */
  colors: z.array(z.string()).max(16).optional(),
  /** Required for `composed`: one of line | bar | area per series */
  seriesKinds: z.array(z.enum(["line", "bar", "area"])).optional(),
});

export type ChartToolPayload = z.infer<typeof chartToolInputSchema>;

function validateChartPayload(
  input: ChartToolPayload
): { ok: true; data: ChartToolPayload } | { ok: false; error: string } {
  const L = input.labels.length;
  const { chartType, series } = input;

  if (chartType === "pie") {
    if (series.length !== 1) {
      return {
        ok: false,
        error:
          "Pie charts require exactly one series (slice values per label).",
      };
    }
    if (series[0].data.length !== L) {
      return {
        ok: false,
        error: `Pie chart: need ${L} data points (one per label), got ${series[0].data.length}.`,
      };
    }
    return { ok: true, data: input };
  }

  for (const s of series) {
    if (s.data.length !== L) {
      return {
        ok: false,
        error: `Series "${s.name}": expected ${L} values (one per label), got ${s.data.length}.`,
      };
    }
  }

  if (chartType === "composed") {
    const kinds = input.seriesKinds;
    if (!kinds || kinds.length !== series.length) {
      return {
        ok: false,
        error:
          "Composed charts require seriesKinds with the same length as series (each entry: line, bar, or area).",
      };
    }
  }

  return { ok: true, data: input };
}

export const renderChart = tool({
  description:
    "Render an interactive, responsive chart in the chat. Use when the user asks for a graph, chart, plot, trend, comparison, distribution, breakdown, KPIs, or analytics. Types: line (trends), bar (compare categories), area (cumulative trends), pie (proportions), radar (multi-axis comparison), scatter (correlation-style points per category), composed (mix bars/lines/areas). Provide human-readable category labels and numeric series aligned 1:1 with labels.",
  inputSchema: chartToolInputSchema,
  execute: (input) => {
    const parsed = chartToolInputSchema.safeParse(input);
    if (!parsed.success) {
      const form = parsed.error.flatten().formErrors.join("; ");
      return {
        error:
          form ||
          "Invalid chart input. Check labels, series names, and numeric arrays.",
      };
    }
    const checked = validateChartPayload(parsed.data);
    if (!checked.ok) {
      return { error: checked.error };
    }
    return checked.data;
  },
});
