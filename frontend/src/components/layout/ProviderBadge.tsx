import { useEffect, useState } from 'react';
import { api, settingsSignal } from '../../services/api';
import { providerLabel } from '../../lib/status';

/**
 * Small header badge naming the active climate source (R11): flips live when
 * the provider is switched in Settings, so judges can watch "Data: TerraClim"
 * appear the moment the token is activated.
 */
export function ProviderBadge({ compact = false }: { compact?: boolean }) {
  const [provider, setProvider] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      api
        .getSettings()
        .then((s) => {
          if (active) setProvider(s.provider);
        })
        .catch(() => {});
    };
    load();
    const unsubscribe = settingsSignal.subscribe(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (!provider) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-slate-tint px-2.5 py-1 text-[11px] font-semibold text-slate"
      title="Active climate data source: switch it in Settings."
    >
      <span className="h-1.5 w-1.5 rounded-full bg-slate-soft" aria-hidden />
      {compact ? providerLabel(provider) : `Data: ${providerLabel(provider)}`}
    </span>
  );
}
