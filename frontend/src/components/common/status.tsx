import type { Status, Traffic } from '../../types/api';
import { trafficMeta, statusMeta } from '../../lib/status';

export function TrafficDot({
  traffic,
  size = 10,
  ring = false,
}: {
  traffic: Traffic;
  size?: number;
  ring?: boolean;
}) {
  const { base } = trafficMeta(traffic);
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: base,
        boxShadow: ring ? '0 0 0 2px var(--tw-ring-offset-color, #fbfaf6)' : undefined,
      }}
      aria-hidden
    />
  );
}

export function StatusPill({ status }: { status: Status }) {
  const meta = statusMeta(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold"
      style={{ background: meta.tint, color: meta.base }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: meta.base }}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}

export function TrafficBadge({ traffic }: { traffic: Traffic }) {
  const meta = trafficMeta(traffic);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ background: meta.tint, color: meta.base }}
    >
      {meta.label}
    </span>
  );
}

/**
 * Compact severity meter. The fill grows with the block's score; its color is
 * the traffic light so state reads across the whole bar.
 */
export function ScoreMeter({
  score,
  traffic,
  showValue = true,
}: {
  score: number;
  traffic: Traffic;
  showValue?: boolean;
}) {
  const meta = trafficMeta(traffic);
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-pill bg-line">
        <div
          className="absolute inset-y-0 left-0 rounded-pill"
          style={{ width: `${Math.min(100, score)}%`, background: meta.base }}
        />
      </div>
      {showValue && (
        <span className="nums w-7 text-right text-xs font-semibold text-ink-soft">
          {score}
        </span>
      )}
    </div>
  );
}
