import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../services/api';
import { useAsync } from '../hooks/useApi';
import type { Backtest as BacktestData, BacktestEvent } from '../types/api';
import { PageHeader, Section, StatTile } from '../components/common/primitives';
import { LoadingPanel, ErrorState } from '../components/common/states';
import { Icon, type IconName } from '../components/layout/icons';
import { fmtDayMonth, fmtFullDate, fmtLongDate } from '../lib/format';
import { color } from '../theme/tokens';

const EVENT_ICON: Record<string, IconName> = {
  heat_spike: 'sun',
  wet_swing: 'droplet',
};

function ScoreChart({ data }: { data: BacktestData }) {
  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <ComposedChart data={data.series} margin={{ top: 8, right: 16, bottom: 4, left: -6 }}>
          <defs>
            <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color.high} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color.high} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={color.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDayMonth}
            interval={Math.max(1, Math.round(data.series.length / 6)) - 1}
            tick={{ fill: color.inkMuted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: color.axis }}
            minTickGap={16}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fill: color.inkMuted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={34}
          />
          <Area
            dataKey="farm_mean_score"
            stroke={color.high}
            strokeWidth={2}
            fill="url(#scoreFill)"
            dot={false}
            isAnimationActive={false}
          />
          {data.events.map((e) => (
            <ReferenceLine
              key={e.date}
              x={e.date}
              stroke={color.slate}
              strokeDasharray="3 3"
              strokeOpacity={0.6}
              label={{
                value: fmtDayMonth(e.date),
                position: 'top',
                fill: color.slate,
                fontSize: 10,
              }}
            />
          ))}
          <Tooltip
            cursor={{ stroke: color.axis }}
            contentStyle={{ borderRadius: 8, border: `1px solid ${color.line}`, fontSize: 12 }}
            labelFormatter={(l) => fmtLongDate(String(l))}
            formatter={(v: number, name) => [
              v,
              name === 'farm_mean_score' ? 'Farm mean score' : String(name),
            ]}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function EventCard({ e }: { e: BacktestEvent }) {
  const isHeat = e.type === 'heat_spike';
  const accent = isHeat ? color.high : color.wet;
  return (
    <div className="rounded-lg border border-line bg-raised p-4">
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          style={{ background: isHeat ? color.highTint : color.wetTint, color: accent }}
        >
          <Icon name={EVENT_ICON[e.type] ?? 'info'} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-ink">
              {e.type.replace('_', ' ')}
            </span>
            <span className="nums text-xs text-ink-muted">{fmtFullDate(e.date)}</span>
          </div>
          <div className="mt-1 font-display text-xl" style={{ color: accent }}>
            Caught {e.lead_days} days early
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{e.narrative}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {e.blocks_flagged.map((b) => (
              <span
                key={b}
                className="nums rounded-sm bg-slate-tint px-1.5 py-0.5 text-[11px] font-bold text-slate"
              >
                {b}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Backtest() {
  const btQ = useAsync(() => api.getBacktest(4), []);
  const bestLead = btQ.data?.events.reduce((m, e) => Math.max(m, e.lead_days), 0) ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Does it actually work?"
        title="Backtest"
        subtitle="Replay the season day by day through the same engine. Every heat spike was flagged before it hit — this is the proof, not a promise."
      />

      {btQ.loading ? (
        <div className="card">
          <LoadingPanel label="Replaying the season" />
        </div>
      ) : btQ.error || !btQ.data ? (
        <div className="card">
          <ErrorState message="Backtest unavailable." onRetry={btQ.reload} />
        </div>
      ) : (
        <>
          <div className="grid gap-2.5 sm:grid-cols-3">
            <StatTile label="Events detected" value={btQ.data.events.length} accent={color.bordeaux} />
            <StatTile label="Best lead time" value={bestLead} unit="days early" accent={color.stable} />
            <StatTile
              label="Window"
              value={`${fmtDayMonth(btQ.data.window[0])} – ${fmtDayMonth(btQ.data.window[1])}`}
            />
          </div>

          <Section title="Farm mean score" hint="Higher = more blocks drifting off their glide path.">
            <ScoreChart data={btQ.data} />
          </Section>

          <Section title="Detected events">
            <div className="grid gap-3 sm:grid-cols-2">
              {btQ.data.events.map((e) => (
                <EventCard key={e.date} e={e} />
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
