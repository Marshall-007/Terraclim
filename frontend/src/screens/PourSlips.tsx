import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { useAsync } from '../hooks/useApi';
import type { BlockFeature, BlockStatus } from '../types/api';
import { PageHeader } from '../components/common/primitives';
import { LoadingPanel, ErrorState } from '../components/common/states';
import { Icon } from '../components/layout/icons';
import { stageLabel, styleLabel } from '../lib/status';
import { fmtFraction, fmtFullDate, fmtMm } from '../lib/format';
import { color } from '../theme/tokens';

function buildWhatsApp(block: BlockFeature['properties'], s: BlockStatus): string {
  const lines =
    s.pour_slip.type === 'hold'
      ? [
          `Vino slip · ${block.id} ${block.name}`,
          `HOLD — soil is wet (${s.pour_slip.hold_days} days above target)`,
          `Stage ${stageLabel(s.stage)} · depletion ${fmtFraction(s.depletion_fraction)} (band ${s.target_band[0].toFixed(2)}-${s.target_band[1].toFixed(2)})`,
          `Next check ${s.pour_slip.next_check}`,
        ]
      : [
          `Vino slip · ${block.id} ${block.name}`,
          `POUR ${s.pour_slip.runtime_hours.toFixed(1)} h tonight (${fmtMm(s.pour_slip.needed_mm)})`,
          `Stage ${stageLabel(s.stage)} · depletion ${fmtFraction(s.depletion_fraction)} (band ${s.target_band[0].toFixed(2)}-${s.target_band[1].toFixed(2)})`,
          `Next check ${s.pour_slip.next_check}`,
        ];
  return `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
}

function Slip({ block, s }: { block: BlockFeature['properties']; s: BlockStatus }) {
  const hold = s.pour_slip.type === 'hold';
  const accent = hold ? color.wet : color.bordeaux;
  return (
    <div className="print-sheet mx-auto max-w-md overflow-hidden rounded-lg border border-line bg-white shadow-card">
      <div className="h-1.5 w-full" style={{ background: accent }} />
      <div className="px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="eyebrow" style={{ color: accent }}>
              {hold ? 'Hold advisory' : 'Irrigation slip'}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="nums rounded-sm bg-slate-tint px-1.5 py-0.5 text-sm font-bold text-slate">
                {block.id}
              </span>
              <h2 className="text-xl leading-tight text-ink">{block.name}</h2>
            </div>
            <p className="mt-0.5 text-xs text-ink-muted">
              {block.variety} · {styleLabel(block.wine_style)} · {block.area_ha} ha
            </p>
          </div>
          <div className="text-right text-[11px] text-ink-muted">
            <div className="nums">{fmtFullDate(s.as_of)}</div>
            <div>{block.application_rate_mm_h} mm/h drip</div>
          </div>
        </div>

        <div className="my-5 border-y border-dashed border-line py-6 text-center">
          {hold ? (
            <>
              <div className="font-display text-5xl leading-none" style={{ color: accent }}>
                Hold water
              </div>
              <p className="mt-2 text-sm text-ink-soft">
                {s.pour_slip.hold_days} days above band · recheck {s.pour_slip.next_check}
              </p>
            </>
          ) : (
            <>
              <div className="font-display text-6xl leading-none" style={{ color: accent }}>
                {s.pour_slip.runtime_hours.toFixed(1)}
                <span className="ml-1 text-3xl">hours</span>
              </div>
              <p className="mt-2 text-sm text-ink-soft">
                {fmtMm(s.pour_slip.needed_mm)} · {s.pour_slip.window}
              </p>
            </>
          )}
        </div>

        <dl className="nums space-y-1.5 text-sm">
          <Row label="Stage">{stageLabel(s.stage)}</Row>
          <Row label="Depletion / band">
            {fmtFraction(s.depletion_fraction)} / {s.target_band[0].toFixed(2)}–
            {s.target_band[1].toFixed(2)}
          </Row>
          <Row label="Status">{s.status.replace('_', ' ')}</Row>
          <Row label="Next check">{s.pour_slip.next_check}</Row>
        </dl>

        <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-soft">
          {s.recommendation}
        </p>

        <div className="mt-4 flex items-center justify-between text-[10px] uppercase tracking-wide text-ink-muted">
          <span>Vino · deficit-irrigation glide path</span>
          <span>Signed ____________</span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-medium text-ink">{children}</dd>
    </div>
  );
}

function SlipView({ id }: { id: string }) {
  const blocksQ = useAsync(() => api.getBlocks(), []);
  const statusQ = useAsync(() => api.getBlockStatus(id), [id]);
  const block = blocksQ.data?.features.find((f) => f.properties.id === id)?.properties;

  if (statusQ.loading || blocksQ.loading) return <LoadingPanel label="Printing the slip" />;
  if (statusQ.error || !statusQ.data || !block)
    return <ErrorState message="Slip unavailable." onRetry={statusQ.reload} />;

  const s = statusQ.data;
  return (
    <div className="space-y-4">
      <Slip block={block} s={s} />
      <div className="no-print mx-auto flex max-w-md gap-2">
        <a
          href={buildWhatsApp(block, s)}
          target="_blank"
          rel="noreferrer"
          className="btn-ghost flex-1"
        >
          <Icon name="share" size={16} /> Share to WhatsApp
        </a>
        <button className="btn-primary flex-1" onClick={() => window.print()}>
          <Icon name="print" size={16} /> Print
        </button>
      </div>
    </div>
  );
}

export function PourSlips() {
  const [params, setParams] = useSearchParams();
  const blocksQ = useAsync(() => api.getBlocks(), []);
  const features = blocksQ.data?.features ?? [];
  const selected = params.get('block') ?? features[0]?.properties.id ?? null;

  const pick = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('block', id);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div className="no-print">
        <PageHeader
          eyebrow="Field prescription"
          title="Pour Slips"
          subtitle="A clean card the foreman carries — print it, or share tonight's instruction straight to the crew on WhatsApp."
        />
      </div>

      <div className="no-print flex flex-wrap gap-2">
        {features.map((f) => (
          <button
            key={f.properties.id}
            onClick={() => pick(f.properties.id)}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              selected === f.properties.id
                ? 'border-bordeaux bg-bordeaux-tint text-bordeaux-dark'
                : 'border-line bg-raised text-ink-soft hover:bg-slate-tint'
            }`}
          >
            <span className="nums mr-1.5 font-bold text-slate">{f.properties.id}</span>
            {f.properties.name}
          </button>
        ))}
      </div>

      {selected ? (
        <SlipView id={selected} />
      ) : blocksQ.loading ? (
        <div className="card">
          <LoadingPanel />
        </div>
      ) : (
        <div className="card">
          <ErrorState message="No blocks available." onRetry={blocksQ.reload} />
        </div>
      )}
    </div>
  );
}
