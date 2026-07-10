import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAsync } from '../hooks/useApi';
import type { BlockProperties, Driver, HistoryPoint } from '../types/api';
import { GlidePathChart } from '../components/chart/GlidePathChart';
import { EtChart } from '../components/chart/EtChart';
import { NdviSparkline } from '../components/chart/NdviSparkline';
import { BandGauge } from '../components/common/BandGauge';
import { StatusPill, TrafficBadge } from '../components/common/status';
import { KeyValue } from '../components/common/primitives';
import { LoadingPanel, ErrorState, Spinner } from '../components/common/states';
import { PhotoCapture } from '../components/photos/PhotoCapture';
import { PhotoGallery } from '../components/photos/PhotoGallery';
import { Icon } from '../components/layout/icons';
import { stageLabel, styleLabel } from '../lib/status';
import {
  fmtFraction,
  fmtGdd,
  fmtHours,
  fmtMm,
  fmtMpa,
  fmtMpaBand,
  fmtSigned,
} from '../lib/format';
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
              {d.unit && <span className="ml-0.5 text-ink-muted">{d.unit}</span>}
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

/** ETa vs modelled ETc divergence over the last 7 measured days (%). */
function transpirationDeficit(history: HistoryPoint[]): number | null {
  const recent = history.slice(-7).filter((h) => h.eta != null);
  if (recent.length < 4) return null;
  const etaSum = recent.reduce((s, h) => s + (h.eta as number), 0);
  const etcSum = recent.reduce((s, h) => s + h.etc, 0);
  if (etcSum <= 0) return null;
  return Math.round((1 - etaSum / etcSum) * 100);
}

function TerrainCard({ block }: { block: BlockProperties }) {
  const settingsQ = useAsync(() => api.getSettings(), []);
  const t = block.terrain;
  const packLoaded = settingsQ.data?.datapack.loaded ?? false;

  const rows: { label: string; value: string | null }[] = [
    { label: 'Elevation', value: t ? `${t.elevation_m.toFixed(0)} m` : null },
    { label: 'Slope', value: t ? `${t.slope_deg.toFixed(1)}°` : null },
    { label: 'Aspect', value: t ? t.aspect : null },
    {
      label: 'Jan ET0 normal',
      value: t ? `${t.jan_et0_normal_mm_day.toFixed(1)} mm/day` : null,
    },
    {
      label: 'Annual rain normal',
      value: t ? `${t.annual_rain_normal_mm.toFixed(0)} mm` : null,
    },
  ];

  return (
    <div className="rounded-md border border-line bg-raised p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow inline-flex items-center gap-1.5">
          <Icon name="mountain" size={13} /> Terrain &amp; climate context
        </span>
        {!t && (
          <span className="rounded-pill bg-slate-tint px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-soft">
            {packLoaded ? 'Awaiting layer' : 'Pending data pack'}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
        TerraClim terrain-adjusted values for this exact polygon — zonal statistics
        over the traced boundary, not a grid-cell average.
      </p>
      <dl className="mt-3 space-y-0.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4 py-1">
            <dt className="text-sm text-ink-muted">{r.label}</dt>
            <dd className="nums text-sm font-medium text-ink">
              {r.value ?? <span className="text-ink-muted">—</span>}
            </dd>
          </div>
        ))}
      </dl>
      {!t && (
        <p className="mt-2 border-t border-line pt-2 text-[11px] leading-relaxed text-ink-muted">
          Values populate from the TerraClim / ET-GEO data pack — no placeholder
          numbers are shown here.
        </p>
      )}
    </div>
  );
}

function PhotoSection({ blockId }: { blockId: string }) {
  const photosQ = useAsync(() => api.getPhotos(blockId), [blockId]);
  return (
    <div>
      <div className="mb-2 eyebrow">Field photos</div>
      <PhotoCapture blockId={blockId} onUploaded={() => photosQ.reload()} />
      <div className="mt-3">
        {photosQ.loading ? (
          <div className="py-6 text-center text-xs text-ink-muted">Loading photos…</div>
        ) : photosQ.error ? (
          <ErrorState message="Photos unavailable." onRetry={photosQ.reload} />
        ) : (
          <PhotoGallery photos={photosQ.data ?? []} />
        )}
      </div>
    </div>
  );
}

function DeleteBlock({
  block,
  onDeleted,
}: {
  block: BlockProperties;
  onDeleted?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    const res = await api.deleteBlock(block.id);
    if (res.ok) {
      onDeleted?.();
    } else {
      setError(res.error ?? 'Could not delete this block.');
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div className="rounded-md border border-line bg-raised p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-ink">Traced block</div>
          <p className="mt-0.5 text-xs text-ink-muted">
            Drawn in-app — deleting removes it and its scores.
          </p>
        </div>
        {confirming ? (
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Keep
            </button>
            <button
              className="btn bg-critical text-paper hover:opacity-90"
              onClick={() => void run()}
              disabled={busy}
            >
              {busy ? <Spinner className="border-paper/40 border-t-paper" /> : 'Confirm delete'}
            </button>
          </div>
        ) : (
          <button className="btn-ghost text-critical" onClick={() => setConfirming(true)}>
            <Icon name="trash" size={15} /> Delete
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-critical">{error}</p>}
    </div>
  );
}

function PanelBody({
  block,
  onDeleted,
}: {
  block: BlockProperties;
  onDeleted?: () => void;
}) {
  const id = block.id;
  const statusQ = useAsync(() => api.getBlockStatus(id), [id]);
  const tsQ = useAsync(() => api.getTimeseries(id, 45), [id]);

  if (statusQ.loading || tsQ.loading) return <LoadingPanel label="Reading the glide path" />;
  if (statusQ.error || !statusQ.data)
    return <ErrorState message="Block status unavailable." onRetry={statusQ.reload} />;

  const s = statusQ.data;
  const isWet = s.status === 'too_wet';
  const history = tsQ.data?.history ?? [];
  const deficitDriver = s.drivers.find((d) => d.key === 'transpiration_deficit_pct');
  const deficitPct = deficitDriver?.value ?? transpirationDeficit(history);

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
        {/* the grower's unit — MSWP (R3) */}
        {s.mswp_estimate_mpa != null && s.mswp_band_mpa && (
          <div className="mt-3 rounded-md border border-line bg-raised px-3 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="nums text-sm font-semibold text-ink">
                ≈ {fmtMpa(s.mswp_estimate_mpa)}{' '}
                <span className="font-normal text-ink-soft">
                  stem water potential (modelled)
                </span>
              </span>
              <span className="nums text-xs text-ink-muted">
                target {fmtMpaBand(s.mswp_band_mpa)}
              </span>
            </div>
            <Link
              to={`/validate?block=${id}`}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-bordeaux hover:text-bordeaux-dark"
            >
              Log a pressure-bomb reading to anchor it{' '}
              <Icon name="chevron-right" size={13} />
            </Link>
          </div>
        )}
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

      {/* ET panel — the brief-core per-day signals (v2 §A) */}
      {history.length > 0 && (
        <div>
          <div className="mb-1 eyebrow">Water use — ETo vs ETa</div>
          <p className="mb-3 text-xs text-ink-muted">
            mm/day, last 28 days. Kc and NDVI ride along in the tooltip.
          </p>
          {deficitPct != null && deficitPct >= 8 && (
            <div
              className="mb-3 inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-semibold"
              style={{ background: color.highTint, color: color.high }}
            >
              <Icon name="arrow-down" size={13} />
              Vines transpiring {deficitPct}% below expectation
            </div>
          )}
          <EtChart history={history} />
          <div className="mt-3">
            <NdviSparkline history={history} />
          </div>
        </div>
      )}

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

      {/* TerraClim terrain & normals (R1) */}
      <TerrainCard block={block} />

      {/* field photos (R17) */}
      <PhotoSection blockId={id} />

      {/* user-traced block management (v2 §F) */}
      {block.user_created && <DeleteBlock block={block} onDeleted={onDeleted} />}
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
  onBlocksChanged,
}: {
  block: BlockProperties | null;
  onClose: () => void;
  /** Called after this block is deleted so the caller can refetch. */
  onBlocksChanged?: () => void;
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
              {block.user_created && (
                <span className="rounded-pill bg-bordeaux-tint px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-bordeaux">
                  Traced
                </span>
              )}
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
          <PanelBody
            block={block}
            onDeleted={() => {
              onClose();
              onBlocksChanged?.();
            }}
          />
        </div>
      </aside>
    </div>
  );
}
