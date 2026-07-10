import { useState } from 'react';
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
import type { SeasonBank as SeasonBankData } from '../types/api';
import { PageHeader, Section, StatTile } from '../components/common/primitives';
import { LoadingPanel, ErrorState } from '../components/common/states';
import { fmtDayMonth, fmtFullDate, fmtLongDate, fmtM3 } from '../lib/format';
import { color } from '../theme/tokens';

const PRESETS = [8000, 12000, 16000, 20000];

const VERDICT_STYLE: Record<
  SeasonBankData['verdict'],
  { color: string; tint: string; label: string }
> = {
  ok: { color: color.stable, tint: color.stableTint, label: 'Within budget' },
  tight: { color: color.watch, tint: color.watchTint, label: 'Tight' },
  shortfall: { color: color.critical, tint: color.criticalTint, label: 'Shortfall' },
};

function BurnDownChart({ data }: { data: SeasonBankData }) {
  const runDryLabel = data.run_dry_date ? fmtDayMonth(data.run_dry_date) : null;
  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <ComposedChart data={data.burn_down} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="bankFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color.bordeaux} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color.bordeaux} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={color.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDayMonth}
            interval={Math.max(1, Math.round(data.burn_down.length / 6)) - 1}
            tick={{ fill: color.inkMuted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: color.axis }}
            minTickGap={12}
          />
          <YAxis
            tickFormatter={(v) => `${Math.round(v / 1000)}k`}
            tick={{ fill: color.inkMuted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Area
            dataKey="bank_m3"
            stroke={color.bordeaux}
            strokeWidth={2}
            fill="url(#bankFill)"
            isAnimationActive={false}
            dot={false}
          />
          <ReferenceLine y={0} stroke={color.axis} />
          {data.run_dry_date && (
            <ReferenceLine
              x={data.run_dry_date}
              stroke={color.critical}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              label={{
                value: `run dry · ${runDryLabel}`,
                position: 'insideTopRight',
                fill: color.critical,
                fontSize: 11,
                fontWeight: 600,
              }}
            />
          )}
          <Tooltip
            cursor={{ stroke: color.axis }}
            contentStyle={{
              borderRadius: 8,
              border: `1px solid ${color.line}`,
              fontSize: 12,
            }}
            labelFormatter={(l) => fmtLongDate(String(l))}
            formatter={(v: number, name) => [
              fmtM3(v),
              name === 'bank_m3' ? 'Water bank' : String(name),
            ]}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function Verdict({ data }: { data: SeasonBankData }) {
  const v = VERDICT_STYLE[data.verdict];
  return (
    <div
      className="overflow-hidden rounded-lg border"
      style={{ borderColor: `${v.color}44`, background: v.tint }}
    >
      <div className="px-6 py-6">
        <div className="eyebrow" style={{ color: v.color }}>
          {v.label}
        </div>
        {data.run_dry_date ? (
          <>
            <h2 className="mt-2 font-display text-3xl leading-tight sm:text-4xl" style={{ color: v.color }}>
              You run dry on {fmtFullDate(data.run_dry_date)}
            </h2>
            <p className="mt-2 text-sm" style={{ color: color.ink }}>
              {data.days_short} days short of harvest at the current burn rate.
            </p>
          </>
        ) : (
          <h2 className="mt-2 font-display text-3xl leading-tight sm:text-4xl" style={{ color: v.color }}>
            The dam carries you through harvest
          </h2>
        )}
      </div>
    </div>
  );
}

export function SeasonBank() {
  const [remaining, setRemaining] = useState(12000);
  const bankQ = useAsync(() => api.getSeasonBank(remaining), [remaining]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Day-zero resilience"
        title="Season Water Bank"
        subtitle="Amortise the water left in the dam across the rest of the season by phenological priority. See exactly when the tank runs dry — and what to change."
      />

      <Section>
        <label className="eyebrow mb-2 block">Water remaining in dam</label>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <input
              type="number"
              className="field nums w-36"
              min={0}
              step={500}
              value={remaining}
              onChange={(e) => setRemaining(Math.max(0, Number(e.target.value) || 0))}
            />
            <span className="text-sm text-ink-muted">m³</span>
          </div>
          <input
            type="range"
            min={4000}
            max={22000}
            step={500}
            value={remaining}
            onChange={(e) => setRemaining(Number(e.target.value))}
            className="h-1.5 flex-1 min-w-[180px] cursor-pointer accent-bordeaux"
          />
          <div className="flex gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setRemaining(p)}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                  remaining === p
                    ? 'border-bordeaux bg-bordeaux-tint text-bordeaux-dark'
                    : 'border-line bg-raised text-ink-soft hover:bg-slate-tint'
                }`}
              >
                {(p / 1000).toFixed(0)}k
              </button>
            ))}
          </div>
        </div>
      </Section>

      {bankQ.loading ? (
        <div className="card">
          <LoadingPanel label="Amortising the season" />
        </div>
      ) : bankQ.error || !bankQ.data ? (
        <div className="card">
          <ErrorState message="Could not project the water bank." onRetry={bankQ.reload} />
        </div>
      ) : (
        <>
          <Verdict data={bankQ.data} />

          <div className="grid gap-2.5 sm:grid-cols-3">
            <StatTile label="Water remaining" value={bankQ.data.remaining_m3.toLocaleString('en-ZA')} unit="m³" />
            <StatTile
              label="Projected demand"
              value={bankQ.data.projected_demand_m3.toLocaleString('en-ZA')}
              unit="m³"
            />
            <StatTile
              label="Shortfall window"
              value={bankQ.data.days_short}
              unit={bankQ.data.days_short === 1 ? 'day' : 'days'}
              accent={bankQ.data.days_short > 0 ? color.critical : color.stable}
            />
          </div>

          <Section title="Burn-down to harvest" hint="Water bank against projected demand.">
            <BurnDownChart data={bankQ.data} />
          </Section>

          <div className="rounded-lg border border-slate/20 bg-slate-tint px-5 py-4">
            <div className="eyebrow mb-1.5 text-slate">Advice</div>
            <p className="text-sm leading-relaxed text-ink">{bankQ.data.advice}</p>
          </div>
        </>
      )}
    </div>
  );
}
