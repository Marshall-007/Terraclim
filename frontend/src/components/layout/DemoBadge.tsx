import { useDemoMode } from '../../hooks/useApi';

/**
 * Small pill that appears only when the app is serving bundled demo data
 * (backend unreachable). Honest about the data source without being alarming.
 */
export function DemoBadge({ compact = false }: { compact?: boolean }) {
  const demo = useDemoMode();
  if (!demo) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill border border-watch/40 bg-watch-tint px-2.5 py-1 text-[11px] font-semibold text-watch"
      title="Backend not reachable: showing bundled demo fixtures that match the API contract."
    >
      <span className="h-1.5 w-1.5 rounded-full bg-watch" aria-hidden />
      {compact ? 'Demo' : 'Demo data'}
    </span>
  );
}
