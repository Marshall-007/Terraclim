import { color } from '../../theme/tokens';
import type { Status, TargetBand } from '../../types/api';

/**
 * Horizontal depletion gauge: 0 (saturated) → 1 (fully depleted). The target
 * band is the green zone; left of it reads cool (over-watered / too wet), right
 * reads warm (too dry). The marker is the block's current depletion fraction.
 */
export function BandGauge({
  fraction,
  band,
  status,
  showScale = false,
  height = 12,
}: {
  fraction: number;
  band: TargetBand;
  status: Status;
  showScale?: boolean;
  height?: number;
}) {
  const [lo, hi] = band;
  const pct = (v: number) => `${Math.min(100, Math.max(0, v * 100))}%`;
  const markerColor =
    status === 'too_wet' ? color.wet : status === 'too_dry' ? color.high : color.stable;

  return (
    <div className="w-full">
      <div
        className="relative w-full overflow-hidden rounded-pill"
        style={{ height, background: color.wetTint }}
      >
        {/* too-dry zone (right of hi) */}
        <div
          className="absolute inset-y-0"
          style={{ left: pct(hi), right: 0, background: color.highTint }}
        />
        {/* target band */}
        <div
          className="absolute inset-y-0"
          style={{
            left: pct(lo),
            width: pct(hi - lo),
            background: color.stableTint,
            borderLeft: `1.5px solid ${color.stable}`,
            borderRight: `1.5px solid ${color.stable}`,
          }}
        />
        {/* current-fraction marker */}
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
          style={{
            left: pct(fraction),
            width: height + 2,
            height: height + 2,
            background: markerColor,
          }}
        />
      </div>
      {showScale && (
        <div className="nums mt-1 flex justify-between text-[10px] text-ink-muted">
          <span>0.0 wet</span>
          <span>band {lo.toFixed(2)}–{hi.toFixed(2)}</span>
          <span>1.0 dry</span>
        </div>
      )}
    </div>
  );
}
