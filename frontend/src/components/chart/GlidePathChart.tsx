import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Status, Timeseries } from '../../types/api';
import { color } from '../../theme/tokens';
import { fmtDayMonth, fmtLongDate } from '../../lib/format';

interface Row {
  date: string;
  band: [number, number];
  hist: number | null;
  fcst: number | null;
}

function buildRows(ts: Timeseries): { rows: Row[]; asOf: string; current: number } {
  const rows: Row[] = ts.history.map((h) => ({
    date: h.date,
    band: [h.band_lo, h.band_hi],
    hist: h.depletion_fraction,
    fcst: null,
  }));
  const asOf = ts.history.at(-1)?.date ?? '';
  const current = ts.history.at(-1)?.depletion_fraction ?? 0;
  // Bridge the boundary so the solid and dashed lines meet.
  if (rows.length) rows[rows.length - 1].fcst = current;
  for (const f of ts.forecast) {
    rows.push({
      date: f.date,
      band: [f.band_lo, f.band_hi],
      hist: null,
      fcst: f.depletion_fraction_projected,
    });
  }
  return { rows, asOf, current };
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row: Row | undefined = payload[0]?.payload;
  if (!row) return null;
  const val = row.hist ?? row.fcst;
  const isForecast = row.hist == null;
  return (
    <div className="rounded-md border border-line bg-raised px-3 py-2 text-xs shadow-raised">
      <div className="mb-1 font-medium text-ink">{fmtLongDate(label)}</div>
      <div className="nums flex items-center justify-between gap-4">
        <span className="text-ink-muted">{isForecast ? 'Projected' : 'Depletion'}</span>
        <span className="font-semibold text-ink">{val?.toFixed(2)}</span>
      </div>
      <div className="nums flex items-center justify-between gap-4">
        <span className="text-ink-muted">Target band</span>
        <span className="text-ink-soft">
          {row.band[0].toFixed(2)}–{row.band[1].toFixed(2)}
        </span>
      </div>
    </div>
  );
}

export function GlidePathChart({
  timeseries,
  status,
  height = 300,
}: {
  timeseries: Timeseries;
  status: Status;
  height?: number;
}) {
  const { rows, asOf, current } = useMemo(() => buildRows(timeseries), [timeseries]);
  const dotColor =
    status === 'too_wet' ? color.wet : status === 'too_dry' ? color.high : color.stable;
  const tickEvery = Math.max(1, Math.round(rows.length / 7));

  return (
    <div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ComposedChart
            data={rows}
            margin={{ top: 8, right: 14, bottom: 4, left: -8 }}
          >
            <CartesianGrid stroke={color.grid} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDayMonth}
              interval={tickEvery - 1}
              tick={{ fill: color.inkMuted, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: color.axis }}
              minTickGap={8}
            />
            <YAxis
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tickFormatter={(v) => v.toFixed(2)}
              tick={{ fill: color.inkMuted, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            {/* Target glide-path band */}
            <Area
              dataKey="band"
              stroke={color.stable}
              strokeOpacity={0.45}
              strokeWidth={1}
              fill={color.stable}
              fillOpacity={0.12}
              isAnimationActive={false}
              activeDot={false}
              legendType="none"
            />
            <ReferenceLine
              x={asOf}
              stroke={color.axis}
              strokeDasharray="3 3"
              label={{
                value: 'today',
                position: 'insideTopRight',
                fill: color.inkSoft,
                fontSize: 10,
              }}
            />
            {/* Measured and forecast are one measure in two epistemic states:
                one hue, solid vs dashed, so identity never rests on a
                color-pair that CVD viewers can't separate. */}
            <Line
              dataKey="hist"
              stroke={color.bordeaux}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              dataKey="fcst"
              stroke={color.bordeaux}
              strokeWidth={2}
              strokeDasharray="5 4"
              strokeOpacity={0.75}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            <ReferenceDot
              x={asOf}
              y={current}
              r={4.5}
              fill={dotColor}
              stroke={color.surface}
              strokeWidth={2}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: color.axis }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend />
    </div>
  );
}

function ChartLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-ink-soft">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: color.stable, opacity: 0.2 }} />
        Target band
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-[2px] w-5" style={{ background: color.bordeaux }} />
        Depletion (measured)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block h-0 w-5 border-t-2 border-dashed"
          style={{ borderColor: color.bordeaux, opacity: 0.75 }}
        />
        14-day forecast
      </span>
    </div>
  );
}
