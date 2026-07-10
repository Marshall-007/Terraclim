import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { useAsync } from '../hooks/useApi';
import type { ValidationReading } from '../types/api';
import { ValidationChart } from '../components/chart/ValidationChart';
import { GliTrend } from '../components/chart/GliTrend';
import { PageHeader, Section, StatTile } from '../components/common/primitives';
import { LoadingPanel, ErrorState, EmptyState, Spinner } from '../components/common/states';
import { BacktestPanel } from './Backtest';
import { Icon } from '../components/layout/icons';
import { fmtMpa, fmtSigned } from '../lib/format';
import { color } from '../theme/tokens';

type Tab = 'model' | 'backtest';

function LogReadingForm({
  blockId,
  defaultDate,
  onLogged,
}: {
  blockId: string;
  defaultDate: string;
  onLogged: () => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [mpa, setMpa] = useState('-1.10');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ValidationReading | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setResult(null);
    const value = Number(mpa);
    if (!Number.isFinite(value) || value >= 0 || value < -3) {
      setError('Enter a midday stem water potential in MPa, e.g. −1.15 (between −3 and 0).');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Pick a reading date.');
      return;
    }
    setBusy(true);
    try {
      const reading = await api.postValidationReading({
        block_id: blockId,
        date,
        mswp_mpa: value,
        note: note.trim() || undefined,
      });
      setResult(reading);
      setNote('');
      onLogged();
    } catch {
      setError('Could not log the reading — try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <form
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="block text-xs font-medium text-ink-soft">
          Date
          <input
            type="date"
            className="field mt-1"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="block text-xs font-medium text-ink-soft">
          MSWP (MPa)
          <input
            type="number"
            step="0.01"
            min="-3"
            max="0"
            className="field mt-1"
            value={mpa}
            onChange={(e) => setMpa(e.target.value)}
          />
        </label>
        <label className="block text-xs font-medium text-ink-soft">
          Note (optional)
          <input
            className="field mt-1"
            placeholder="Row, vine, sky conditions"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="flex items-end">
          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={busy}>
            {busy ? <Spinner className="border-paper/40 border-t-paper" /> : 'Log reading'}
          </button>
        </div>
      </form>

      {error && <p className="mt-2 text-xs text-critical">{error}</p>}

      {result && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-line bg-raised px-3 py-2.5 text-sm">
          <Icon name="check" size={15} className="text-stable" />
          <span className="nums font-medium text-ink">{fmtMpa(result.mswp_mpa)} logged.</span>
          <span className="nums text-ink-soft">
            Model that day: {fmtMpa(result.model_mpa)} —{' '}
            {Math.abs(result.delta_mpa) < 0.005 ? (
              'spot on.'
            ) : (
              <>
                reads {Math.abs(result.delta_mpa).toFixed(2)} MPa{' '}
                {result.delta_mpa < 0 ? 'drier (more stressed)' : 'wetter (less stressed)'} than
                the model.
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function ModelTab({ blockId }: { blockId: string }) {
  const valQ = useAsync(() => api.getValidation(blockId), [blockId]);
  const statusQ = useAsync(() => api.getBlockStatus(blockId), [blockId]);
  const photosQ = useAsync(() => api.getPhotos(blockId), [blockId]);

  // Full-screen loading only on first fetch — a reload after logging a
  // reading must not unmount the form (it would wipe the delta feedback).
  if (valQ.loading && !valQ.data) {
    return (
      <div className="card">
        <LoadingPanel label="Comparing model and field" />
      </div>
    );
  }
  if (valQ.error || !valQ.data) {
    return (
      <div className="card">
        <ErrorState message="Validation data unavailable." onRetry={valQ.reload} />
      </div>
    );
  }

  const v = valQ.data;
  const a = v.agreement;
  const hasReadings = a.n > 0;
  const referencePending = v.reference_series.length === 0;
  const band = statusQ.data?.mswp_band_mpa;
  const photos = photosQ.data ?? [];

  return (
    <div className="space-y-6">
      {/* agreement stats */}
      <div className="grid gap-2.5 sm:grid-cols-4">
        <StatTile
          label="Bias (reading − model)"
          value={hasReadings ? `${fmtSigned(a.bias, 2)}` : '—'}
          unit={hasReadings ? 'MPa' : undefined}
          hint={hasReadings ? (a.bias < 0 ? 'model reads slightly wet' : a.bias > 0 ? 'model reads slightly dry' : 'no systematic drift') : 'log a reading'}
        />
        <StatTile
          label="RMSE"
          value={hasReadings ? a.rmse.toFixed(2) : '—'}
          unit={hasReadings ? 'MPa' : undefined}
        />
        <StatTile label="Readings (n)" value={a.n} accent={color.bordeaux} />
        <StatTile
          label="Within target band"
          value={hasReadings ? `${a.within_band_pct}%` : '—'}
          hint={hasReadings ? 'of pressure-bomb readings' : undefined}
        />
      </div>

      {/* model vs field chart */}
      <Section
        title="Model vs field truth"
        hint="Modelled stem water potential against pressure-bomb readings and the satellite reference."
        right={
          referencePending ? (
            <span className="rounded-pill bg-slate-tint px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-soft">
              Reference: pending data pack
            </span>
          ) : (
            <span className="rounded-pill bg-stable-tint px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-stable">
              Reference: {v.reference_source}
            </span>
          )
        }
      >
        <ValidationChart validation={v} band={band} />
        {referencePending && (
          <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-ink-muted">
            The WaPOR / FruitLook reference series overlays here once the ET-GEO data
            pack is loaded (Settings → Data pack). Until then the model is checked
            against pressure-bomb readings only — no synthetic reference is shown.
          </p>
        )}
      </Section>

      {/* log a reading */}
      <Section
        title="Log a pressure-bomb reading"
        hint="One reading anchors the model to this block; the delta vs model is reported immediately."
      >
        <LogReadingForm
          blockId={blockId}
          // model_series is guaranteed present here; statusQ may still be in flight.
          defaultDate={v.model_series.at(-1)?.date ?? statusQ.data?.as_of ?? ''}
          onLogged={valQ.reload}
        />
      </Section>

      {/* photo GLI corroboration */}
      <Section
        title="Field-photo GLI trend"
        hint="Green Leaf Index from canopy photos — a declining GLI corroborates rising modelled stress."
      >
        {photos.length > 0 ? (
          <GliTrend photos={photos} />
        ) : (
          <EmptyState
            title="No canopy photos yet"
            hint="Capture photos from Field Mode or Block Detail; their GLI trend plots here beside the model."
            icon={<Icon name="camera" size={22} />}
          />
        )}
      </Section>
    </div>
  );
}

export function Validate() {
  const [params, setParams] = useSearchParams();
  const blocksQ = useAsync(() => api.getBlocks(), []);
  const features = blocksQ.data?.features ?? [];
  const selected = params.get('block') ?? features[0]?.properties.id ?? null;
  const tab: Tab = params.get('tab') === 'backtest' ? 'backtest' : 'model';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Trust, made visible"
        title="Validate"
        subtitle="Check the model against field truth: pressure-bomb readings, WaPOR/FruitLook reference series and canopy photos — plus a hindsight-free replay of the season."
      />

      {/* tab switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex overflow-hidden rounded-md border border-line bg-surface">
          {(
            [
              ['model', 'Model vs field'],
              ['backtest', 'Would it have caught it'],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setParam('tab', t)}
              className={`px-3.5 py-2 text-sm font-medium transition-colors ${
                tab === t
                  ? 'bg-bordeaux-tint text-bordeaux-dark'
                  : 'text-ink-soft hover:bg-slate-tint'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'model' && (
        <>
          <div className="flex flex-wrap gap-2">
            {features.map((f) => (
              <button
                key={f.properties.id}
                onClick={() => setParam('block', f.properties.id)}
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
            <ModelTab key={selected} blockId={selected} />
          ) : blocksQ.loading ? (
            <div className="card">
              <LoadingPanel />
            </div>
          ) : (
            <div className="card">
              <ErrorState message="No blocks available." onRetry={blocksQ.reload} />
            </div>
          )}
        </>
      )}

      {tab === 'backtest' && <BacktestPanel />}
    </div>
  );
}
