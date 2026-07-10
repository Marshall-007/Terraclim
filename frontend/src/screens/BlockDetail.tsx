import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAsync } from '../hooks/useApi';
import type { BlockProperties, Driver } from '../types/api';
import { GlidePathChart } from '../components/chart/GlidePathChart';
import { BandGauge } from '../components/common/BandGauge';
import { StatusPill, TrafficBadge } from '../components/common/status';
import { KeyValue } from '../components/common/primitives';
import { LoadingPanel, ErrorState } from '../components/common/states';
import { Icon } from '../components/layout/icons';
import { stageLabel, styleLabel } from '../lib/status';
import { fmtFraction, fmtGdd, fmtHours, fmtMm, fmtSigned } from '../lib/format';
import { color } from '../theme/tokens';

const PRESSURE_COLOR: Record<Driver['pressure'], string> = {
  high: color.high,
  moderate: color.watch,
  low: color.slateSoft,
};
const PRESSURE_W: Record<Driver['pressure'], number> = {
  high: 100,
  moderate: 58,
  low: 26,
};

function DriverBars({ drivers }: { drivers: Driver[] }) {
  return (
    <div className="space-y-3">
      {drivers.map((d) => (
        <div key={d.key}>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-ink-soft">{d.label}</span>
            <span className="nums font-medium text-ink">
              {d.value}
              <span className="ml-0.5 text-ink-muted">{d.unit}</span>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-pill bg-line">
            <div
              className="h-full rounded-pill"
              style={{
                width: `${PRESSURE_W[d.pressure]}%`,
                background: PRESSURE_COLOR[d.pressure],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function PanelBody({ block }: { block: BlockProperties }) {
  const id = block.id;
  const statusQ = useAsync(() => api.getBlockStatus(id), [id]);
  const tsQ = useAsync(() => api.getTimeseries(id, 45), [id]);

  if (statusQ.loading || tsQ.loading) return <LoadingPanel label="Reading the glide path" />;
  if (statusQ.error || !statusQ.data)
    return <ErrorState message="Block status unavailable." onRetry={statusQ.reload} />;

  const s = statusQ.data;
  const isWet = s.status === 'too_wet';

  return (
    <div className="space-y-6">
      {/* headline metrics */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={s.status} />
        <TrafficBadge traffic={s.traffic} />
        <span className="ml-auto text-xs text-ink-muted">
          {stageLabel(s.stage)} · {fmtGdd(s.gdd)}
        </span>
      </div>

      {/* depletion vs band */}
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="eyebrow">Depletion vs target band</span>
          <span className="nums text-sm">
            <span className="font-semibold text-ink">{fmtFraction(s.depletion_fraction)}</span>
            <span className="text-ink-muted">
              {' '}
              / {s.target_band[0].toFixed(2)}–{s.target_band[1].toFixed(2)}
            </span>
          </span>
        </div>
        <BandGauge
          fraction={s.depletion_fraction}
          band={s.target_band}
          status={s.status}
          showScale
          height={14}
        />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <MiniStat label="Deviation" value={fmtSigned(s.deviation, 2)} accent={isWet ? color.wet : color.high} />
          <MiniStat label="Score" value={String(s.score)} />
          <MiniStat label="Depletion" value={`${s.depletion_mm.toFixed(0)}`} unit="mm" />
        </div>
      </div>

      {/* recommendation */}
      <div
        className="rounded-md border px-4 py-3 text-sm leading-relaxed"
        style={{
          borderColor: isWet ? `${color.wet}55` : `${color.bordeaux}33`,
          background: isWet ? color.wetTint : color.bordeauxTint,
          color: isWet ? '#1f4f70' : color.bordeauxDark,
        }}
      >
        {s.recommendation}
      </div>

      {/* glide path chart */}
      <div>
        <div className="mb-1 eyebrow">Stress glide path</div>
        <p className="mb-3 text-xs text-ink-muted">
          45 days measured, 14 days forecast, against the {styleLabel(block.wine_style)} band.
        </p>
        {tsQ.data ? (
          <GlidePathChart timeseries={tsQ.data} status={s.status} height={280} />
        ) : (
          <div className="h-[280px]">
            <ErrorState message="Timeseries unavailable." onRetry={tsQ.reload} />
          </div>
        )}
      </div>

      {/* drivers */}
      <div>
        <div className="mb-3 eyebrow">What's driving it</div>
        <DriverBars drivers={s.drivers} />
      </div>

      {/* pour slip summary */}
      <div className="rounded-md border border-line bg-raised p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="eyebrow">
            {s.pour_slip.type === 'hold' ? 'Hold advisory' : 'Tonight'}
          </span>
          <Link
            to={`/slips?block=${id}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-bordeaux hover:text-bordeaux-dark"
          >
            Open pour slip <Icon name="chevron-right" size={14} />
          </Link>
        </div>
        {s.pour_slip.type === 'hold' ? (
          <div className="flex items-baseline gap-2">
            <span className="font-display text-3xl text-wet">
              Hold {s.pour_slip.hold_days}d
            </span>
            <span className="text-sm text-ink-muted">soil is over target</span>
          </div>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="font-display text-3xl text-bordeaux">
              {fmtHours(s.pour_slip.runtime_hours)}
            </span>
            <span className="text-sm text-ink-muted">
              {fmtMm(s.pour_slip.needed_mm)} · {s.pour_slip.window}
            </span>
          </div>
        )}
        <div className="mt-2 border-t border-line pt-2">
          <KeyValue label="Next check">{s.pour_slip.next_check}</KeyValue>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-md border border-line bg-raised px-3 py-2">
      <div className="text-[11px] text-ink-muted">{label}</div>
      <div className="nums mt-0.5 flex items-baseline gap-1">
        <span className="text-lg font-semibold" style={{ color: accent }}>
          {value}
        </span>
        {unit && <span className="text-xs text-ink-muted">{unit}</span>}
      </div>
    </div>
  );
}

export function BlockDetailPanel({
  block,
  onClose,
}: {
  block: BlockProperties | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (block) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [block, onClose]);

  if (!block) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className="absolute inset-0 bg-ink/25 animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <aside className="relative flex h-full w-full max-w-[460px] animate-slide-in flex-col border-l border-line bg-surface shadow-panel">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="nums rounded-sm bg-slate-tint px-1.5 py-0.5 text-xs font-bold text-slate">
                {block.id}
              </span>
              <h2 className="text-lg leading-tight text-ink">{block.name}</h2>
            </div>
            <p className="mt-0.5 text-xs text-ink-muted">
              {block.variety} · {styleLabel(block.wine_style)} · {block.area_ha} ha ·{' '}
              {block.application_rate_mm_h} mm/h
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-ink-muted hover:bg-slate-tint hover:text-ink"
            aria-label="Close"
          >
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-5">
          <PanelBody block={block} />
        </div>
      </aside>
    </div>
  );
}
