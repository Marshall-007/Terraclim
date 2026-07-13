import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BlockPhoto } from '../../types/api';
import { color } from '../../theme/tokens';
import { fmtDayMonth, fmtLongDate } from '../../lib/format';

function GliTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as { date: string; gli: number } | undefined;
  if (!p) return null;
  return (
    <div className="nums rounded-md border border-line bg-raised px-2.5 py-1.5 text-xs shadow-raised">
      <span className="text-ink-muted">{fmtLongDate(p.date)}</span>{' '}
      <span className="font-semibold text-ink">GLI {p.gli.toFixed(2)}</span>
    </div>
  );
}

/**
 * Photo Green Leaf Index over time: the corroborating field-photo series.
 * A single series on its own axis (GLI is unitless 0–1, a different scale
 * from MPa, so it never shares the validation chart's axis).
 */
export function GliTrend({ photos, height = 150 }: { photos: BlockPhoto[]; height?: number }) {
  const rows = useMemo(
    () =>
      photos
        .map((p) => ({ date: p.date, gli: p.analysis.gli_mean }))
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    [photos],
  );
  if (rows.length === 0) return null;

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 14, bottom: 4, left: -14 }}>
          <CartesianGrid stroke={color.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDayMonth}
            tick={{ fill: color.inkMuted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: color.axis }}
            minTickGap={16}
          />
          <YAxis
            domain={[0, 0.3]}
            ticks={[0, 0.1, 0.2, 0.3]}
            tickFormatter={(v) => Number(v).toFixed(1)}
            tick={{ fill: color.inkMuted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Line
            dataKey="gli"
            stroke={color.slate}
            strokeWidth={2}
            dot={{ r: 3.5, fill: color.slate, strokeWidth: 0 }}
            isAnimationActive={false}
          />
          <Tooltip content={<GliTooltip />} cursor={{ stroke: color.axis }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
