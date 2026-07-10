import { useMemo } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HistoryPoint } from '../../types/api';
import { color } from '../../theme/tokens';
import { fmtDayMonth, fmtLongDate } from '../../lib/format';

interface Row {
  date: string;
  et0: number;
  eta: number | null;
  kc: number | null;
  ndvi: number | null;
}

function buildRows(history: HistoryPoint[], days: number): Row[] {
  return history.slice(-days).map((h) => ({
    date: h.date,
    et0: h.et0,
    eta: h.eta ?? null,
    kc: h.et0 > 0 ? Math.round((h.etc / h.et0) * 100) / 100 : null,
    ndvi: h.ndvi ?? null,
  }));
}

function EtTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row: Row | undefined = payload[0]?.payload;
  if (!row) return null;
  const line = (name: string, v: string) => (
    <div className="nums flex items-center justify-between gap-4">
      <span className="text-ink-muted">{name}</span>
      <span className="font-semibold text-ink">{v}</span>
    </div>
  );
  return (
    <div className="rounded-md border border-line bg-raised px-3 py-2 text-xs shadow-raised">
      <div className="mb-1 font-medium text-ink">{fmtLongDate(label)}</div>
      {row.eta != null && line('ETa (measured)', `${row.eta.toFixed(1)} mm`)}
      {line('ETo (reference)', `${row.et0.toFixed(1)} mm`)}
      {row.kc != null && line('Kc', row.kc.toFixed(2))}
      {row.ndvi != null && line('NDVI', row.ndvi.toFixed(2))}
    </div>
  );
}

/**
 * The brief-core ET panel: modelled reference ETo and measured ETa as one
 * measure in two epistemic states — same hue, dashed vs solid — exactly the
 * treatment GlidePathChart uses for measured vs forecast. One y-axis (mm/day);
 * Kc and NDVI ride along in the tooltip so the per-day checklist is complete.
 */
export function EtChart({
  history,
  days = 28,
  height = 200,
}: {
  history: HistoryPoint[];
  days?: number;
  height?: number;
}) {
  const rows = useMemo(() => buildRows(history, days), [history, days]);
  const hasEta = rows.some((r) => r.eta != null);
  const tickEvery = Math.max(1, Math.round(rows.length / 5));

  return (
    <div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 8, right: 14, bottom: 4, left: -14 }}>
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
              domain={[0, 'auto']}
              tickFormatter={(v) => Number(v).toFixed(0)}
              tick={{ fill: color.inkMuted, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={40}
              unit=""
            />
            <Line
              dataKey="et0"
              stroke={color.slate}
              strokeWidth={2}
              strokeDasharray="5 4"
              strokeOpacity={0.7}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            {hasEta && (
              <Line
                dataKey="eta"
                stroke={color.slate}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            )}
            <Tooltip content={<EtTooltip />} cursor={{ stroke: color.axis }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {hasEta ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-[2px] w-5" style={{ background: color.slate }} />
            ETa (measured)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0 w-5 border-t-2 border-dashed"
              style={{ borderColor: color.slate, opacity: 0.7 }}
            />
            ETo (modelled reference)
          </span>
        </div>
      ) : (
        <p className="mt-2 text-xs text-ink-muted">
          ETo (modelled reference) — measured ETa appears once an ETa source is active.
        </p>
      )}
    </div>
  );
}
