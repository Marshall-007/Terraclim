import { useState } from 'react';
import { api } from '../services/api';
import { useAsync } from '../hooks/useApi';
import { PageHeader, Section } from '../components/common/primitives';
import { LoadingPanel, ErrorState, EmptyState } from '../components/common/states';
import { Explainable } from '../insight/Explainable';
import { Icon } from '../components/layout/icons';
import { fmtHours, fmtLongDate, fmtMm } from '../lib/format';
import { color } from '../theme/tokens';

const HORIZONS = [1, 2, 3, 5, 7];

function Stepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const set = (v: number) => onChange(Math.max(1, Math.min(24, Math.round(v * 2) / 2)));
  return (
    <div className="inline-flex items-center overflow-hidden rounded-md border border-line bg-raised">
      <button className="px-3 py-2 text-ink-soft hover:bg-slate-tint" onClick={() => set(value - 0.5)}>
        −
      </button>
      <span className="nums w-16 text-center text-sm font-semibold text-ink">{value} h</span>
      <button className="px-3 py-2 text-ink-soft hover:bg-slate-tint" onClick={() => set(value + 0.5)}>
        +
      </button>
    </div>
  );
}

function HighlightSummary({ text }: { text: string }) {
  // Emphasise the "N m³ water saved" clause.
  const m = text.match(/([\d,]+)\s*m³\s*water saved/i);
  return (
    <div className="rounded-lg border border-bordeaux/25 bg-bordeaux-tint px-5 py-4">
      <div className="eyebrow mb-2 text-bordeaux">Outcome</div>
      <p className="text-base leading-relaxed text-bordeaux-dark">
        {m ? (
          <>
            {text.slice(0, m.index)}
            <span className="font-display text-2xl font-semibold">{m[1]} m³</span>
            <span className="font-semibold"> water saved</span>
            {text.slice((m.index ?? 0) + m[0].length)}
          </>
        ) : (
          text
        )}
      </p>
    </div>
  );
}

export function BattlePlan() {
  const [hours, setHours] = useState(6);
  const [horizon, setHorizon] = useState(3);

  const planQ = useAsync(
    () => api.postBattlePlan({ available_hours_per_day: hours, horizon_days: horizon }),
    [hours, horizon],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Constraint-solved schedule"
        title="Battle Plan"
        subtitle="Set the water you have and Vino orders the blocks by glide-path deviation, stage sensitivity and wine value — skipping anything rain or over-watering will handle."
      />

      <Section>
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <label className="eyebrow mb-2 block">Available hours per day</label>
            <Stepper value={hours} onChange={setHours} />
          </div>
          <div>
            <label className="eyebrow mb-2 block">Horizon</label>
            <div className="inline-flex overflow-hidden rounded-md border border-line">
              {HORIZONS.map((h) => (
                <button
                  key={h}
                  onClick={() => setHorizon(h)}
                  className={`px-3.5 py-2 text-sm font-medium transition-colors ${
                    horizon === h
                      ? 'bg-bordeaux text-paper'
                      : 'bg-raised text-ink-soft hover:bg-slate-tint'
                  }`}
                >
                  {h}d
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {planQ.loading ? (
        <div className="card">
          <LoadingPanel label="Solving the schedule" />
        </div>
      ) : planQ.error || !planQ.data ? (
        <div className="card">
          <ErrorState message="Could not build the plan." onRetry={planQ.reload} />
        </div>
      ) : (
        <>
          <HighlightSummary text={planQ.data.summary} />

          <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            <Section title="Irrigation schedule" hint="Ordered by priority within each day.">
              <ol className="space-y-4">
                {planQ.data.plan.map((day) => (
                  <li key={day.day}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="nums text-sm font-semibold text-ink">
                        {fmtLongDate(day.day)}
                      </span>
                      <span className="h-px flex-1 bg-line" />
                      <span className="text-xs text-ink-muted">
                        {day.entries.length
                          ? `${day.entries.length} block${day.entries.length > 1 ? 's' : ''}`
                          : 'no irrigation'}
                      </span>
                    </div>
                    {day.entries.length === 0 ? (
                      <div className="rounded-md border border-dashed border-line px-4 py-3 text-xs text-ink-muted">
                        Budget held — highest-priority blocks already satisfied.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {day.entries.map((e) => (
                          <div
                            key={e.block_id}
                            className="rounded-md border border-line bg-raised p-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <Explainable
                                subject={{
                                  subject_type: 'battle_plan_entry',
                                  block_id: e.block_id,
                                  context: {
                                    day: day.day,
                                    block_id: e.block_id,
                                    hours: e.hours,
                                    mm: e.mm_applied,
                                  },
                                }}
                                label={`Why ${e.block_id} gets water`}
                                className="gap-2"
                              >
                                <span className="nums rounded-sm bg-slate-tint px-1.5 py-0.5 text-xs font-bold text-slate">
                                  {e.block_id}
                                </span>
                                <span className="nums text-sm font-semibold text-bordeaux">
                                  {fmtHours(e.hours)}
                                </span>
                                <span className="text-xs text-ink-muted">
                                  · {fmtMm(e.mm_applied)}
                                </span>
                              </Explainable>
                            </div>
                            <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
                              {e.reason}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </Section>

            <Section title="Skipped on purpose" hint="Why Vino left water in the dam.">
              {planQ.data.skipped.length === 0 ? (
                <EmptyState title="No blocks skipped" hint="Every block earned its water this cycle." />
              ) : (
                <ul className="space-y-2.5">
                  {planQ.data.skipped.map((s) => (
                    <li
                      key={s.block_id}
                      className="flex gap-3 rounded-md border border-line bg-raised p-3"
                    >
                      <span
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                        style={{ background: color.wetTint, color: color.wet }}
                      >
                        <Icon name="droplet" size={14} />
                      </span>
                      <div>
                        <Explainable
                          subject={{
                            subject_type: 'battle_plan_skip',
                            block_id: s.block_id,
                            context: { day: planQ.data?.as_of, block_id: s.block_id },
                          }}
                          label={`Why ${s.block_id} is skipped`}
                        >
                          <span className="nums text-xs font-bold text-slate">
                            {s.block_id}
                          </span>
                        </Explainable>
                        <p className="text-xs leading-relaxed text-ink-soft">{s.reason}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
