import { useState } from 'react';
import { api } from '../services/api';
import { useAsync } from '../hooks/useApi';
import type { CacheRefreshResponse, Settings as SettingsData } from '../types/api';
import { PageHeader, Section, KeyValue } from '../components/common/primitives';
import { LoadingPanel, ErrorState, Spinner } from '../components/common/states';
import { Icon } from '../components/layout/icons';
import { providerLabel } from '../lib/status';
import { fmtFullDate } from '../lib/format';
import { color } from '../theme/tokens';

/**
 * Data-source and demo-control screen (v2 §D): lets a grower or judge switch
 * the active climate provider (data pack / TerraClim / Open-Meteo) live,
 * force a full cache refresh, and roll the engine's `as_of` date forward or
 * back for the demo, all without a redeploy or restart.
 */

function StatusChip({
  tone,
  children,
}: {
  tone: 'active' | 'ready' | 'pending';
  children: React.ReactNode;
}) {
  const styles =
    tone === 'active'
      ? { background: color.stableTint, color: color.stable }
      : tone === 'ready'
        ? { background: color.slateTint, color: color.slate }
        : { background: color.watchTint, color: color.watch };
  return (
    <span
      className="rounded-pill px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide"
      style={styles}
    >
      {children}
    </span>
  );
}

function ProviderCard({
  title,
  active,
  chip,
  chipTone,
  description,
  children,
}: {
  title: string;
  active: boolean;
  chip: string;
  chipTone: 'active' | 'ready' | 'pending';
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col rounded-lg border bg-surface p-5 shadow-card ${
        active ? 'border-bordeaux/50 ring-1 ring-bordeaux/20' : 'border-line'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base text-ink">{title}</h3>
        <StatusChip tone={chipTone}>{chip}</StatusChip>
      </div>
      <p className="mt-2 flex-1 text-xs leading-relaxed text-ink-soft">{description}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

function TerraClimControls({
  settings,
  onChanged,
}: {
  settings: SettingsData;
  onChanged: () => void;
}) {
  // Token lives only in this input's state: never persisted, never echoed.
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const activate = async () => {
    setBusy(true);
    setMessage(null);
    const res = await api.postProvider({
      provider: 'terraclim',
      token: token || undefined,
    });
    if (res.ok) {
      setMessage({ ok: true, text: 'Live test call passed: TerraClim is now the active source.' });
      setToken('');
      onChanged();
    } else {
      setMessage({ ok: false, text: res.error ?? 'Activation failed.' });
    }
    setBusy(false);
  };

  return (
    <div className="space-y-2.5">
      <div className="nums text-xs text-ink-muted">Token: {settings.token_status}</div>
      <input
        type="password"
        autoComplete="off"
        className="field"
        placeholder="Paste TerraClim token (write-only)"
        value={token}
        onChange={(e) => setToken(e.target.value)}
      />
      <button className="btn-primary w-full" onClick={() => void activate()} disabled={busy}>
        {busy ? <Spinner className="border-paper/40 border-t-paper" /> : 'Test & Activate'}
      </button>
      {message && (
        <p
          className="text-xs leading-relaxed"
          style={{ color: message.ok ? color.stable : color.critical }}
        >
          {message.text}
        </p>
      )}
      <p className="text-[11px] leading-relaxed text-ink-muted">
        Validated with one live call before switching. The token is sent once and
        stored server-side only, never in this browser.
      </p>
    </div>
  );
}

function OpenMeteoControls({
  settings,
  onChanged,
}: {
  settings: SettingsData;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const active = settings.provider === 'open-meteo';
  if (active) return null;
  return (
    <button
      className="btn-ghost w-full"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await api.postProvider({ provider: 'open-meteo' });
        setBusy(false);
        onChanged();
      }}
    >
      {busy ? <Spinner /> : 'Switch back to Open-Meteo'}
    </button>
  );
}

function CacheSection({ onChanged }: { onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CacheRefreshResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.postCacheRefresh();
      setResult(res);
      onChanged();
    } catch {
      setError('Cache refresh failed: is the backend reachable?');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Golden cache"
      hint='The "Day 0 button": purge and re-warm every block from the active provider, so the demo runs with the network unplugged.'
      right={
        <button className="btn-primary" onClick={() => void refresh()} disabled={busy}>
          {busy ? <Spinner className="border-paper/40 border-t-paper" /> : (
            <>
              <Icon name="refresh" size={15} /> Refresh all blocks
            </>
          )}
        </button>
      }
    >
      {error && <p className="text-xs text-critical">{error}</p>}
      {result ? (
        <>
          <p className="mb-1 text-xs text-ink-muted">
            Purged {result.purged} cache {result.purged === 1 ? 'entry' : 'entries'}, then
            re-warmed every block from the active provider:
          </p>
          <ul className="divide-y divide-line">
            {(result.rewarmed ?? []).map((r) => (
              <li key={r.block_id} className="flex items-center gap-3 py-2 text-sm">
                <Icon
                  name={r.ok ? 'check' : 'close'}
                  size={15}
                  className={r.ok ? 'text-stable' : 'text-critical'}
                />
                <span className="nums w-8 font-bold text-slate">{r.block_id}</span>
                <span className="nums flex-1 text-xs text-ink-soft">
                  {r.ok
                    ? `re-warmed from ${r.source ?? 'active provider'}`
                    : r.error ?? 'refresh failed'}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        !error && (
          <p className="text-xs text-ink-muted">
            Not refreshed this session. Flip the provider, press refresh once, and the
            whole app runs on the new source.
          </p>
        )
      )}
    </Section>
  );
}

function DemoDateSection({
  settings,
  onChanged,
}: {
  settings: SettingsData;
  onChanged: () => void;
}) {
  const [date, setDate] = useState(settings.as_of);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);

  return (
    <Section
      title="Engine date (as_of)"
      hint="The engine evaluates the farm as of this date (a runtime demo control, no env edit or restart)."
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-xs font-medium text-ink-soft">
          as_of
          <input
            type="date"
            className="field mt-1"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <button
          className="btn-primary"
          disabled={busy || !/^\d{4}-\d{2}-\d{2}$/.test(date)}
          onClick={async () => {
            setBusy(true);
            const res = await api.postDemoDate({ as_of: date });
            setApplied(res.as_of);
            setBusy(false);
            onChanged();
          }}
        >
          {busy ? <Spinner className="border-paper/40 border-t-paper" /> : 'Apply'}
        </button>
        {applied && (
          <span className="nums pb-2.5 text-xs text-ink-soft">
            Engine now evaluates the farm as of {fmtFullDate(applied)}.
          </span>
        )}
      </div>
    </Section>
  );
}

export function Settings() {
  const settingsQ = useAsync(() => api.getSettings(), []);
  const s = settingsQ.data;

  // Keep the screen mounted through refetches (useAsync retains previous
  // data), so activation/refresh feedback isn't wiped by its own onChanged.
  if (settingsQ.loading && !s) {
    return (
      <div className="card">
        <LoadingPanel label="Reading data-source status" />
      </div>
    );
  }
  if (settingsQ.error || !s) {
    return (
      <div className="card">
        <ErrorState message="Settings unavailable." onRetry={settingsQ.reload} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Data source & demo controls"
        title="Settings"
        subtitle={`Active source: ${providerLabel(s.provider)} · as of ${fmtFullDate(s.as_of)}. Switch providers live: no code change, no redeploy.`}
      />

      {/* provider cards */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ProviderCard
          title="Data pack"
          active={s.provider === 'datapack'}
          chip={s.provider === 'datapack' ? 'Active' : s.datapack.loaded ? 'Loaded' : 'Not loaded'}
          chipTone={s.provider === 'datapack' ? 'active' : s.datapack.loaded ? 'ready' : 'pending'}
          description="The ET-GEO pack: 10 m daily ETo rasters, Sentinel-2 vigour, Kc/phenology and RF ETa, all computed as zonal statistics over each traced polygon. Activates automatically once the pack is dropped into backend/app/data/datapack/."
        >
          {s.datapack.loaded && s.datapack.layers && (
            <div className="flex flex-wrap gap-1.5">
              {s.datapack.layers.map((l) => (
                <span key={l} className="rounded-pill bg-slate-tint px-2 py-0.5 text-[11px] font-medium text-slate">
                  {l}
                </span>
              ))}
            </div>
          )}
        </ProviderCard>

        <ProviderCard
          title="TerraClim"
          active={s.provider === 'terraclim'}
          chip={
            s.provider === 'terraclim' ? 'Active' : s.terraclim_ready ? 'Ready' : 'Needs token'
          }
          chipTone={
            s.provider === 'terraclim' ? 'active' : s.terraclim_ready ? 'ready' : 'pending'
          }
          description="Terrain-adjusted climate surfaces, long-term normals and polygon zonal statistics: the foundation layer that knows where every block sits."
        >
          <TerraClimControls settings={s} onChanged={settingsQ.reload} />
        </ProviderCard>

        <ProviderCard
          title="Open-Meteo"
          active={s.provider === 'open-meteo'}
          chip={s.provider === 'open-meteo' ? 'Active' : 'Standby'}
          chipTone={s.provider === 'open-meteo' ? 'active' : 'ready'}
          description="Free global archive + 14-day forecast feed: the forward-looking layer. No key needed; always available as the fallback."
        >
          <OpenMeteoControls settings={s} onChanged={settingsQ.reload} />
        </ProviderCard>
      </div>

      {/* cache */}
      <CacheSection onChanged={settingsQ.reload} />

      {/* demo date */}
      <DemoDateSection settings={s} onChanged={settingsQ.reload} />

      {/* current state readout */}
      <Section title="Data freshness">
        <dl>
          <KeyValue label="Active provider">{providerLabel(s.provider)}</KeyValue>
          <KeyValue label="Cache entries">{s.cache.entries}</KeyValue>
          <KeyValue label="Oldest cache entry">
            {s.cache.oldest_minutes} min
          </KeyValue>
          <KeyValue label="TerraClim ready">{s.terraclim_ready ? 'yes' : 'no'}</KeyValue>
          <KeyValue label="Data pack">{s.datapack.loaded ? s.datapack.path ?? 'loaded' : 'not loaded'}</KeyValue>
        </dl>
      </Section>

      <p className="text-center text-xs text-ink-muted">Built on TerraClim ET-GEO science.</p>
    </div>
  );
}
