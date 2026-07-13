import { useMemo } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BlockValidation } from '../../types/api';
import { color } from '../../theme/tokens';
import { fmtDayMonth, fmtLongDate, fmtMpa } from '../../lib/format';

interface Row {
  date: string;
  model: number | null;
  ref: number | null;
  reading: number | null;
  note: string | null;
}

function buildRows(v: BlockValidation): Row[] {
  const byDate = new Map<string, Row>();
  const row = (date: string): Row => {
    let r = byDate.get(date);
    if (!r) {
      r = { date, model: null, ref: null, reading: null, note: null };
      byDate.set(date, r);
    }
    return r;
  };
  for (const p of v.model_series) row(p.date).model = p.mpa;
  for (const p of v.reference_series) row(p.date).ref = p.mpa;
  for (const r of v.readings) {
    const target = row(r.date);
    target.reading = r.mswp_mpa;
    target.note = r.note;
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

function ValidationTooltip({ active, payload, label }: any) {
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
    <div className="max-w-[220px] rounded-md border border-line bg-raised px-3 py-2 text-xs shadow-raised">
      <div className="mb-1 font-medium text-ink">{fmtLongDate(label)}</div>
      {row.model != null && line('Model (modelled)', fmtMpa(row.model))}
      {row.ref != null && line('Reference', fmtMpa(row.ref))}
      {row.reading != null && line('Pressure bomb', fmtMpa(row.reading))}
      {row.note && <p className="mt-1 text-[11px] text-ink-muted">{row.note}</p>}
    </div>
  );
}

/**
 * Model stress vs field truth on one MPa axis: modelled MSWP as the bordeaux
 * line, the reference series (WaPOR/FruitLook) as a dashed slate line
 * (dash + legend so identity never rests on the hue pair alone), and pressure
 * bomb readings as point marks with ≥8px hover targets.
 */
export function ValidationChart({
  validation,
  band,
  height = 280,
}: {
  validation: BlockValidation;
  band?: [number, number];
  height?: number;
}) {
  const rows = useMemo(() => buildRows(validation), [validation]);
  const hasRef = validation.reference_series.length > 0;
  const values = rows.flatMap((r) =>
    [r.model, r.ref, r.reading].filter((v): v is number => v != null),
  );
  const lo = Math.min(...values, band ? Math.min(...band) : Infinity) - 0.12;
  const hi = Math.max(...values, band ? Math.max(...band) : -Infinity) + 0.12;
  const tickEvery = Math.max(1, Math.round(rows.length / 6));

  return (
    <div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 8, right: 14, bottom: 4, left: -4 }}>
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
              domain={[Math.floor(lo * 10) / 10, Math.ceil(hi * 10) / 10]}
              tickFormatter={(v) => fmtMpa(Number(v)).replace(' MPa', '')}
              tick={{ fill: color.inkMuted, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            {band && (
              <ReferenceArea
                y1={Math.min(...band)}
                y2={Math.max(...band)}
                fill={color.stable}
                fillOpacity={0.1}
                stroke={color.stable}
                strokeOpacity={0.35}
              />
            )}
            <Line
              dataKey="model"
              stroke={color.bordeaux}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            {hasRef && (
              <Line
                dataKey="ref"
                stroke={color.slate}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            )}
            <Scatter
              dataKey="reading"
              fill={color.ink}
              stroke={color.surface}
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Tooltip content={<ValidationTooltip />} cursor={{ stroke: color.axis }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-ink-soft">
        {band && (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-4 rounded-sm"
              style={{ background: color.stable, opacity: 0.2 }}
            />
            Target band
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-[2px] w-5" style={{ background: color.bordeaux }} />
          Model MSWP (modelled)
        </span>
        {hasRef && (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0 w-5 border-t-2 border-dashed"
              style={{ borderColor: color.slate }}
            />
            Reference ({validation.reference_source})
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full ring-2 ring-surface"
            style={{ background: color.ink }}
          />
          Pressure-bomb reading
        </span>
      </div>
    </div>
  );
}
