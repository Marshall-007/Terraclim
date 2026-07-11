import { useMemo } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import type { HistoryPoint } from '../../types/api';
import { Explainable } from '../../insight/Explainable';
import { color } from '../../theme/tokens';
import { fmtLongDate } from '../../lib/format';

function SparkTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as { date: string; ndvi: number } | undefined;
  if (!p) return null;
  return (
    <div className="nums rounded-md border border-line bg-raised px-2.5 py-1.5 text-xs shadow-raised">
      <span className="text-ink-muted">{fmtLongDate(p.date)}</span>{' '}
      <span className="font-semibold text-ink">{p.ndvi.toFixed(2)}</span>
    </div>
  );
}

/**
 * Compact NDVI vigour trend: a quiet single-series sparkline (no legend
 * needed) with the latest value read out beside it in ink, not series color.
 */
export function NdviSparkline({
  history,
  blockId,
}: {
  history: HistoryPoint[];
  /** Enables the block-scoped NDVI term lookup on the label. */
  blockId?: string;
}) {
  const rows = useMemo(
    () =>
      history
        .filter((h) => h.ndvi != null)
        .map((h) => ({ date: h.date, ndvi: h.ndvi as number })),
    [history],
  );
  if (rows.length < 2) return null;
  const latest = rows[rows.length - 1].ndvi;
  const first = rows[0].ndvi;
  const drift = latest - first;

  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-raised px-3 py-2">
      <div className="min-w-0">
        <div className="text-[11px] text-ink-muted">
          <Explainable
            subject={{ subject_type: 'term', block_id: blockId, subject_id: 'NDVI' }}
            label="NDVI"
          >
            <span>NDVI (Sentinel-2)</span>
          </Explainable>
        </div>
        <div className="nums mt-0.5 flex items-baseline gap-1.5">
          <span className="text-lg font-semibold text-ink">{latest.toFixed(2)}</span>
          <span className="nums text-xs text-ink-muted">
            {drift <= -0.02 ? `−${Math.abs(drift).toFixed(2)} over window` : drift >= 0.02 ? `+${drift.toFixed(2)} over window` : 'steady'}
          </span>
        </div>
      </div>
      <div className="h-10 min-w-0 flex-1">
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
            <YAxis hide domain={['dataMin - 0.05', 'dataMax + 0.05']} />
            <Line
              dataKey="ndvi"
              stroke={color.slate}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Tooltip content={<SparkTooltip />} cursor={{ stroke: color.axis }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
