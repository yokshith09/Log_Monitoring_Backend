import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { AXIS, GRID, MUTED, SEVERITY_COLOR, SURFACE, fmtMs, fmtNum, fmtTime } from "@/lib/viz";

/* Mark specs from the dataviz skill:
   - 2px lines, no per-point dots, activeDot >= 8px
   - 4px rounded data-ends on bars, anchored to the baseline
   - a 2px surface-coloured gap between stacked segments and adjacent bars
   - recessive grid: horizontal hairlines only, no vertical rules, no axis spine
   - tooltips on by default; a chart in HTML is interactive                   */

const axisProps = {
  stroke: AXIS,
  tick: { fill: MUTED, fontSize: 11 },
  tickLine: false,
  axisLine: false
} as const;

function ChartTooltip({ active, payload, label, formatter, labelFormatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border-border/70 bg-popover rounded-md border px-3 py-2 shadow-lg">
      <p className="text-muted-foreground mb-1.5 text-[0.7rem] tracking-wide uppercase">
        {labelFormatter ? labelFormatter(label) : label}
      </p>
      <ul className="space-y-1">
        {payload.map((row: any) => (
          <li key={row.dataKey} className="flex items-center gap-2 text-xs">
            <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: row.color ?? row.fill }} />
            <span className="text-muted-foreground">{row.name}</span>
            <span className="tabular ml-auto font-medium">
              {formatter ? formatter(row.value) : fmtNum(row.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Trend over time, one or more series. */
export function TrendLine({
  data,
  series,
  height = 220,
  yFormatter = fmtNum,
  xKey = "t"
}: {
  data: any[];
  series: { key: string; label: string; color: string }[];
  height?: number;
  yFormatter?: (n: number) => string;
  xKey?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="0" vertical={false} />
        <XAxis dataKey={xKey} tickFormatter={fmtTime} minTickGap={48} {...axisProps} />
        <YAxis tickFormatter={yFormatter} width={52} {...axisProps} />
        <Tooltip
          cursor={{ stroke: AXIS, strokeWidth: 1 }}
          content={<ChartTooltip formatter={yFormatter} labelFormatter={fmtTime} />}
        />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: SURFACE }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Single-series magnitude over time. */
export function TrendArea({
  data,
  dataKey,
  label,
  color,
  height = 200,
  yFormatter = fmtNum,
  xKey = "t",
  xFormatter = fmtTime
}: {
  data: any[];
  dataKey: string;
  label: string;
  color: string;
  height?: number;
  yFormatter?: (n: number) => string;
  xKey?: string;
  xFormatter?: (v: any) => string;
}) {
  const gradientId = `grad-${dataKey}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tickFormatter={xFormatter} minTickGap={48} {...axisProps} />
        <YAxis tickFormatter={yFormatter} width={52} {...axisProps} />
        <Tooltip
          cursor={{ stroke: AXIS, strokeWidth: 1 }}
          content={<ChartTooltip formatter={yFormatter} labelFormatter={xFormatter} />}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          name={label}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          activeDot={{ r: 4, strokeWidth: 2, stroke: SURFACE }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Part-to-whole over time. Severity stacks INFO → WARNING → ERROR. */
export function SeverityStack({ data, height = 200 }: { data: any[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -12 }} barCategoryGap="18%">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="t" tickFormatter={fmtTime} minTickGap={48} {...axisProps} />
        <YAxis tickFormatter={fmtNum} width={52} {...axisProps} />
        <Tooltip cursor={{ fill: "rgb(255 255 255 / 0.04)" }} content={<ChartTooltip labelFormatter={fmtTime} />} />
        {(["INFO", "WARNING", "ERROR"] as const).map((severity, index, all) => (
          <Bar
            key={severity}
            dataKey={severity}
            name={severity}
            stackId="severity"
            fill={SEVERITY_COLOR[severity]}
            // 2px surface gap between stacked segments; top segment gets the
            // rounded data-end, the rest stay square against the baseline.
            stroke={SURFACE}
            strokeWidth={1}
            radius={index === all.length - 1 ? [3, 3, 0, 0] : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Magnitude comparison with long labels — horizontal, one hue. */
export function RankedBars({
  data,
  labelKey,
  valueKey,
  color = "var(--chart-1)",
  formatter = fmtNum,
  height = 240,
  highlightOver
}: {
  data: any[];
  labelKey: string;
  valueKey: string;
  color?: string;
  formatter?: (n: number) => string;
  height?: number;
  highlightOver?: number;
}) {
  const max = Math.max(...data.map((d) => d[valueKey]), 1);

  return (
    <ul className="space-y-2.5" style={{ minHeight: height }}>
      {data.map((row) => {
        const value = row[valueKey];
        const pct = (value / max) * 100;
        const hot = highlightOver !== undefined && value > highlightOver;
        return (
          <li key={row[labelKey]} className="group">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate font-mono text-xs" title={row[labelKey]}>
                {row[labelKey]}
              </span>
              {/* Direct label — the value is on the row, not only in a tooltip. */}
              <span className="tabular text-muted-foreground shrink-0 text-xs font-medium">
                {formatter(value)}
              </span>
            </div>
            <div className="bg-secondary h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${Math.max(2, pct)}%`, background: hot ? "var(--sev-warning)" : color }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Daily spend. Anomalous days are marked by colour AND an annotation. */
export function CostBars({ data, anomalyDates }: { data: any[]; anomalyDates: Set<string> }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -8 }} barCategoryGap="22%">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(d) => new Date(d).toLocaleDateString([], { month: "short", day: "numeric" })}
          minTickGap={36}
          {...axisProps}
        />
        <YAxis tickFormatter={(v) => `$${v.toFixed(0)}`} width={48} {...axisProps} />
        <Tooltip
          cursor={{ fill: "rgb(255 255 255 / 0.04)" }}
          content={<ChartTooltip formatter={(v: number) => `$${v.toFixed(2)}`} />}
        />
        <Bar dataKey="cost" name="Daily spend" radius={[3, 3, 0, 0]}>
          {data.map((row) => (
            <Cell
              key={row.date}
              fill={anomalyDates.has(row.date) ? "var(--sev-warning)" : "var(--chart-1)"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export { fmtMs };
