import { useMemo, useState } from 'react';
import { api } from '../services/api';
import { useAsync } from '../hooks/useApi';
import type { ScenarioBlock, ScenarioType } from '../types/api';
import { PageHeader, Section } from '../components/common/primitives';
import { StatusPill, ScoreMeter } from '../components/common/status';
import { LoadingPanel, ErrorState } from '../components/common/states';
import { Explainable } from '../insight/Explainable';
import { Icon, type IconName } from '../components/layout/icons';
import { color } from '../theme/tokens';

/**
 * "What-if" stress test screen: picks a scenario (heatwave, drought, rain
 * event, cool spell) and a day window, sends it to the engine, and re-ranks
 * every block by the resulting score so growers can see which blocks would
 * jump in priority under that forcing.
 */

const SCENARIOS: {
  type: ScenarioType;
  label: string;
  icon: IconName;
  blurb: string;
}[] = [
  { type: 'heatwave', label: 'Heatwave', icon: 'sun', blurb: '+6 °C and +30% ET0 for the window.' },
  { type: 'drought', label: 'Drought', icon: 'droplet', blurb: 'No rainfall across the window.' },
  { type: 'rain_event', label: 'Rain event', icon: 'droplet', blurb: '+25 mm over two days.' },
  { type: 'cool_spell', label: 'Cool spell', icon: 'refresh', blurb: '−5 °C and −20% ET0.' },
];

const DAYS = [3, 7, 14];

function DeltaChip({ delta }: { delta: number }) {
  if (delta === 0)
    return <span className="nums text-xs font-medium text-ink-muted">no change</span>;
  const worse = delta > 0; // higher score = more off-path = worse
  return (
    <span
      className="nums inline-flex items-center gap-0.5 rounded-pill px-2 py-0.5 text-xs font-semibold"
      style={{
        background: worse ? color.criticalTint : color.stableTint,
        color: worse ? color.critical : '#006300',
      }}
    >
      <Icon name={worse ? 'arrow-up' : 'arrow-down'} size={12} />
      {Math.abs(delta)}
    </span>
  );
}

export function Scenario() {
  const [type, setType] = useState<ScenarioType>('heatwave');
  const [days, setDays] = useState(7);
  const scenarioQ = useAsync(() => api.postScenario({ type, days }), [type, days]);

  const active = SCENARIOS.find((s) => s.type === type)!;
  const sorted = useMemo<ScenarioBlock[]>(
    () => (scenarioQ.data ? [...scenarioQ.data].sort((a, b) => b.score - a.score) : []),
    [scenarioQ.data],
  );
  const worsened = sorted.filter((b) => b.delta > 0).length;
  const improved = sorted.filter((b) => b.delta < 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="What-if stress test"
        title="Scenario"
        subtitle="Perturb the forward weather and watch the farm re-rank. The blocks that jump are the ones to pre-empt."
      />

      <Section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SCENARIOS.map((s) => (
              <button
                key={s.type}
                onClick={() => setType(s.type)}
                className={`flex items-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors ${
                  type === s.type
                    ? 'border-bordeaux bg-bordeaux-tint text-bordeaux-dark'
                    : 'border-line bg-raised text-ink-soft hover:bg-slate-tint'
                }`}
              >
                <Icon name={s.icon} size={16} />
                {s.label}
              </button>
            ))}
          </div>
          <div>
            <label className="eyebrow mb-1.5 block">Window</label>
            <div className="inline-flex overflow-hidden rounded-md border border-line">
              {DAYS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-3 py-2 text-sm font-medium ${
                    days === d ? 'bg-bordeaux text-paper' : 'bg-raised text-ink-soft hover:bg-slate-tint'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-muted">{active.blurb}</p>
      </Section>

      {scenarioQ.loading ? (
        <div className="card">
          <LoadingPanel label="Running the perturbation" />
        </div>
      ) : scenarioQ.error || !scenarioQ.data ? (
        <div className="card">
          <ErrorState message="Scenario failed." onRetry={scenarioQ.reload} />
        </div>
      ) : (
        <Section
          title={`Re-ranked under a ${days}-day ${active.label.toLowerCase()}`}
          right={
            <span className="text-xs text-ink-muted">
              <span className="font-semibold text-critical">{worsened} worse</span> ·{' '}
              <span className="font-semibold text-stable">{improved} better</span>
            </span>
          }
        >
          <ol className="divide-y divide-line">
            {sorted.map((b, i) => (
              <li key={b.block_id} className="flex items-center gap-3 py-3">
                <span className="nums w-5 text-center text-sm font-semibold text-ink-muted">
                  {i + 1}
                </span>
                <span className="nums rounded-sm bg-slate-tint px-1.5 py-0.5 text-xs font-bold text-slate">
                  {b.block_id}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StatusPill status={b.status} />
                  </div>
                  <div className="mt-1.5">
                    <ScoreMeter score={b.score} traffic={b.traffic} />
                  </div>
                </div>
                <Explainable
                  subject={{
                    subject_type: 'scenario_delta',
                    block_id: b.block_id,
                    context: { type, days, delta: b.delta },
                  }}
                  label={`${b.block_id} under this scenario`}
                >
                  <DeltaChip delta={b.delta} />
                </Explainable>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  );
}
