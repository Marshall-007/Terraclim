import type { BlockPhoto, StressHint } from '../../types/api';
import { Explainable } from '../../insight/Explainable';
import { Icon } from '../layout/icons';
import { EmptyState } from '../common/states';
import { fmtLongDate } from '../../lib/format';
import { color } from '../../theme/tokens';

const STRESS_META: Record<StressHint, { label: string; base: string; tint: string }> = {
  none: { label: 'No visible stress', base: color.stable, tint: color.stableTint },
  mild: { label: 'Mild stress', base: color.watch, tint: color.watchTint },
  visible: { label: 'Visible stress', base: color.high, tint: color.highTint },
};

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="nums inline-flex items-center gap-1 rounded-pill bg-slate-tint px-2 py-0.5 text-[11px] font-medium text-slate">
      {children}
    </span>
  );
}

function AnalysisChips({ photo }: { photo: BlockPhoto }) {
  const a = photo.analysis;
  const stress = STRESS_META[a.stress_hint];
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip>GLI {a.gli_mean.toFixed(2)}</Chip>
      <Chip>Canopy {a.canopy_cover_pct}%</Chip>
      <Chip>Yellowing {a.yellowing_pct}%</Chip>
      <span
        className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-semibold"
        style={{ background: stress.tint, color: stress.base }}
      >
        {stress.label}
      </span>
      <span
        className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-semibold"
        style={
          a.agrees_with_model
            ? { background: color.stableTint, color: color.stable }
            : { background: color.criticalTint, color: color.critical }
        }
      >
        <Icon name={a.agrees_with_model ? 'check' : 'close'} size={11} />
        {a.agrees_with_model ? 'Matches model' : 'Differs from model'}
      </span>
    </div>
  );
}

/**
 * Per-block photo gallery with the deterministic screening analysis
 * (GLI / canopy cover / yellowing; an honest phone-camera heuristic,
 * not ML) rendered as chips under each capture.
 */
export function PhotoGallery({ photos }: { photos: BlockPhoto[] }) {
  if (photos.length === 0) {
    return (
      <EmptyState
        title="No photos yet"
        hint="Capture a canopy photo to get a screening read: GLI, canopy cover and yellowing, checked against the model."
        icon={<Icon name="camera" size={22} />}
      />
    );
  }
  return (
    <div className="space-y-3">
      {photos.map((p) => (
        <div key={p.photo_id} className="rounded-md border border-line bg-raised p-3">
          <div className="flex gap-3">
            <img
              src={p.url}
              alt={`Canopy, ${fmtLongDate(p.date)}`}
              className="h-20 w-28 shrink-0 rounded-sm border border-line object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="nums text-xs font-medium text-ink">
                <Explainable
                  subject={{
                    subject_type: 'photo_analysis',
                    block_id: p.block_id,
                    subject_id: p.photo_id,
                    context: { photo_id: p.photo_id },
                  }}
                  label="This photo's analysis"
                >
                  <span>{fmtLongDate(p.date)}</span>
                </Explainable>
              </div>
              {p.note && (
                <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{p.note}</p>
              )}
              <div className="mt-2">
                <AnalysisChips photo={p} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
