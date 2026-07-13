import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAsync } from '../hooks/useApi';
import type { BlockFeature, BlockPhoto } from '../types/api';
import { findBlockAt } from '../lib/geo';
import { BandGauge } from '../components/common/BandGauge';
import { StatusPill } from '../components/common/status';
import { LoadingPanel, ErrorState, Spinner } from '../components/common/states';
import { PhotoCapture } from '../components/photos/PhotoCapture';
import { PhotoGallery } from '../components/photos/PhotoGallery';
import { Explainable } from '../insight/Explainable';
import { Icon } from '../components/layout/icons';
import { stageLabel } from '../lib/status';
import { fmtFraction, fmtMm } from '../lib/format';
import { color } from '../theme/tokens';

/**
 * Field Mode: the one-thumb screen a grower opens standing in the vineyard.
 * "Use my location" geolocates and matches the GPS fix against the traced
 * block polygons; failing that (or on desktop) they pick a block chip
 * directly. Once a block is chosen it shows tonight's single instruction
 * plus an in-field photo capture.
 */

// Local state machine for the geolocation attempt: idle (nothing tried yet)
// -> locating (waiting on the browser) -> resolves to either idle again
// (a containing block was found and selected) or outside/error (no match /
// permission denied), both of which fall back to manual block selection.
type GeoState =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'error'; message: string }
  | { kind: 'outside' };

function BlockChips({
  features,
  selected,
  onSelect,
}: {
  features: BlockFeature[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {features.map((f) => {
        const active = f.properties.id === selected;
        return (
          <button
            key={f.properties.id}
            onClick={() => onSelect(f.properties.id)}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? 'border-bordeaux bg-bordeaux-tint text-bordeaux-dark'
                : 'border-line bg-raised text-ink-soft hover:bg-slate-tint'
            }`}
          >
            <span className="nums mr-1.5 font-bold text-slate">{f.properties.id}</span>
            {f.properties.name.split(' ')[1] ?? f.properties.name}
          </button>
        );
      })}
    </div>
  );
}

function Verdict({ id }: { id: string }) {
  const statusQ = useAsync(() => api.getBlockStatus(id), [id]);
  if (statusQ.loading) return <LoadingPanel label="Reading the block" />;
  if (statusQ.error || !statusQ.data)
    return <ErrorState message="Block status unavailable." onRetry={statusQ.reload} />;

  const s = statusQ.data;
  const hold = s.pour_slip.type === 'hold';
  const accent = hold ? color.wet : color.bordeaux;

  return (
    <div className="text-center">
      <div className="mb-4 flex items-center justify-center gap-2">
        <span className="nums rounded-sm bg-slate-tint px-1.5 py-0.5 text-sm font-bold text-slate">
          {s.block_id}
        </span>
        <StatusPill status={s.status} />
      </div>

      <div
        className="mx-auto rounded-xl border px-6 py-8"
        style={{
          borderColor: `${accent}33`,
          background: hold ? color.wetTint : color.bordeauxTint,
        }}
      >
        {hold ? (
          <>
            <div className="font-display text-5xl leading-none sm:text-6xl" style={{ color: accent }}>
              Hold
            </div>
            <p className="mt-3 text-base" style={{ color: color.ink }}>
              <Explainable
                subject={{ subject_type: 'pour_slip', block_id: id }}
                label="Tonight's verdict"
              >
                <span>Soil is wet: {s.pour_slip.hold_days} days above target</span>
              </Explainable>
            </p>
          </>
        ) : (
          <>
            <div className="font-display text-6xl leading-none sm:text-7xl" style={{ color: accent }}>
              {s.pour_slip.runtime_hours.toFixed(1)}
              <span className="ml-1 text-3xl">h</span>
            </div>
            <p className="mt-3 text-base" style={{ color: color.ink }}>
              <Explainable
                subject={{ subject_type: 'pour_slip', block_id: id }}
                label="Tonight's verdict"
              >
                <span>
                  Pour {fmtMm(s.pour_slip.needed_mm)} · {s.pour_slip.window}
                </span>
              </Explainable>
            </p>
          </>
        )}
      </div>

      <p className="mx-auto mt-5 max-w-sm text-sm leading-relaxed text-ink-soft">
        {s.recommendation}
      </p>

      <div className="mx-auto mt-5 max-w-sm">
        <div className="mb-1.5 flex items-center justify-between text-xs text-ink-muted">
          <span>{stageLabel(s.stage)}</span>
          <span className="nums">
            {fmtFraction(s.depletion_fraction)} / {s.target_band[0].toFixed(2)}–
            {s.target_band[1].toFixed(2)}
          </span>
        </div>
        <BandGauge fraction={s.depletion_fraction} band={s.target_band} status={s.status} height={12} />
      </div>

      <Link
        to={`/slips?block=${id}`}
        className="btn-ghost mx-auto mt-6 inline-flex"
      >
        <Icon name="slip" size={16} /> Open pour slip
      </Link>
    </div>
  );
}

/**
 * In-field canopy capture (R17): shoot, upload, and get the screening read
 * back immediately: the "prove it where you stand" leg of the trust story.
 */
function FieldPhoto({ blockId }: { blockId: string }) {
  const [lastPhoto, setLastPhoto] = useState<BlockPhoto | null>(null);
  return (
    <div className="card p-5">
      <div className="eyebrow mb-1">Field photo</div>
      <p className="mb-3 text-xs text-ink-muted">
        Capture the canopy right here: GLI, cover and yellowing are checked
        against the model's read of this block.
      </p>
      <PhotoCapture blockId={blockId} onUploaded={setLastPhoto} />
      {lastPhoto && (
        <div className="mt-3">
          <PhotoGallery photos={[lastPhoto]} />
        </div>
      )}
    </div>
  );
}

export function FieldMode() {
  const blocksQ = useAsync(() => api.getBlocks(), []);
  const [selected, setSelected] = useState<string | null>(null);
  const [geo, setGeo] = useState<GeoState>({ kind: 'idle' });

  // Kicks off the browser's async geolocation prompt; the result lands in one
  // of the two callbacks below, both of which resolve `geo` to a terminal state.
  const locate = () => {
    if (!('geolocation' in navigator)) {
      setGeo({ kind: 'error', message: 'This device has no GPS. Pick your block below.' });
      return;
    }
    setGeo({ kind: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const features = blocksQ.data?.features ?? [];
        const hit = findBlockAt([pos.coords.longitude, pos.coords.latitude], features);
        if (hit) {
          setSelected(hit.properties.id);
          setGeo({ kind: 'idle' });
        } else {
          setGeo({ kind: 'outside' });
        }
      },
      () => setGeo({ kind: 'error', message: 'Location blocked. Pick your block below.' }),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="text-center">
        <div className="eyebrow">Field mode</div>
        <h1 className="mt-1 text-2xl text-ink">What do I do, right here?</h1>
      </div>

      {blocksQ.loading ? (
        <div className="card">
          <LoadingPanel label="Loading blocks" />
        </div>
      ) : blocksQ.error || !blocksQ.data ? (
        <div className="card">
          <ErrorState message="Could not load blocks." onRetry={blocksQ.reload} />
        </div>
      ) : (
        <>
          <div className="card p-5">
            <button
              onClick={locate}
              disabled={geo.kind === 'locating'}
              className="btn-primary w-full"
            >
              {geo.kind === 'locating' ? (
                <>
                  <Spinner className="border-paper/40 border-t-paper" /> Finding your block…
                </>
              ) : (
                <>
                  <Icon name="location" size={16} /> Use my location
                </>
              )}
            </button>

            {geo.kind === 'error' && (
              <p className="mt-3 text-center text-xs text-watch">{geo.message}</p>
            )}
            {geo.kind === 'outside' && (
              <p className="mt-3 text-center text-xs text-ink-muted">
                You are outside the mapped blocks. Pick one below.
              </p>
            )}

            <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-wide text-ink-muted">
              <span className="h-px flex-1 bg-line" /> or pick a block{' '}
              <span className="h-px flex-1 bg-line" />
            </div>

            <BlockChips
              features={blocksQ.data.features}
              selected={selected}
              onSelect={setSelected}
            />
          </div>

          {selected ? (
            <>
              <div className="card p-6">
                <Verdict id={selected} />
              </div>
              <FieldPhoto key={selected} blockId={selected} />
            </>
          ) : (
            <div className="card p-8 text-center text-sm text-ink-muted">
              Detect your location or tap a block to get tonight's single instruction.
            </div>
          )}
        </>
      )}
    </div>
  );
}
