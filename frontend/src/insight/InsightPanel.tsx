/**
 * The shared Insight surface (v2 §H): a right slide-in panel on desktop and a
 * bottom sheet on mobile. Headline in the display serif, facts as a tabular
 * label/value list, caveats as a muted note, and an honest source tag —
 * "Engine explanation" (template) or "AI-phrased" (ai), never anything else.
 */

import { useEffect, useRef } from 'react';
import type { Insight } from '../types/api';
import { useInsight } from './InsightContext';
import { Icon } from '../components/layout/icons';
import { Spinner } from '../components/common/states';

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function SourceTag({ source }: { source: Insight['source'] }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-raised px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
      <span
        className={`h-1.5 w-1.5 rounded-full ${source === 'ai' ? 'bg-bordeaux' : 'bg-slate-soft'}`}
        aria-hidden
      />
      {source === 'ai' ? 'AI-phrased' : 'Engine explanation'}
    </span>
  );
}

function Loaded({ insight }: { insight: Insight }) {
  return (
    <div className="space-y-5">
      <h2 id="insight-headline" className="font-display text-2xl leading-snug text-ink">
        {insight.headline}
      </h2>

      <p className="text-sm leading-relaxed text-ink-soft">{insight.explanation}</p>

      {insight.facts.length > 0 && (
        <div className="rounded-md border border-line bg-raised px-4 py-2">
          <dl className="divide-y divide-line">
            {insight.facts.map((f) => (
              <div
                key={f.label}
                className="flex items-baseline justify-between gap-4 py-2"
              >
                <dt className="text-xs text-ink-muted">{f.label}</dt>
                <dd className="nums text-right text-sm font-medium text-ink">
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {insight.caveats.length > 0 && (
        <div className="flex gap-2.5 rounded-md border border-line bg-slate-tint/60 px-4 py-3">
          <Icon name="info" size={15} className="mt-0.5 shrink-0 text-slate-soft" />
          <div className="space-y-1.5 text-xs leading-relaxed text-ink-soft">
            {insight.caveats.map((c) => (
              <p key={c}>{c}</p>
            ))}
          </div>
        </div>
      )}

      <div>
        <SourceTag source={insight.source} />
      </div>
    </div>
  );
}

export function InsightPanel() {
  const { state, closeInsight, retry } = useInsight();
  const panelRef = useRef<HTMLElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const open = state !== null;

  // Focus moves into the panel on open and returns to the trigger on close.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => restoreRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeInsight();
        return;
      }
      // Minimal focus trap: Tab cycles within the dialog.
      if (e.key === 'Tab' && panelRef.current) {
        const nodes = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
        ).filter((n) => !n.hasAttribute('disabled'));
        if (nodes.length === 0) {
          e.preventDefault();
          return;
        }
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === panelRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    // Capture phase so Escape closes this topmost layer before any panel below.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, closeInsight]);

  if (!state) return null;

  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center lg:items-stretch lg:justify-end">
      <div
        className="absolute inset-0 bg-ink/25 animate-fade-in"
        onClick={closeInsight}
        aria-hidden
      />
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="insight-headline"
        aria-label="Explanation"
        tabIndex={-1}
        className="relative flex max-h-[85vh] w-full flex-col rounded-t-xl border-t border-line bg-surface shadow-panel outline-none animate-sheet-up lg:h-full lg:max-h-none lg:max-w-[420px] lg:rounded-none lg:border-l lg:border-t-0 lg:animate-slide-in"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <span className="eyebrow inline-flex items-center gap-1.5">
            <Icon name="info" size={13} /> Explain
          </span>
          <button
            onClick={closeInsight}
            className="rounded-md p-1.5 text-ink-muted hover:bg-slate-tint hover:text-ink"
            aria-label="Close explanation"
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-5">
          {state.phase === 'loading' && (
            <div
              className="flex min-h-[180px] flex-col items-center justify-center gap-3 text-ink-muted"
              id="insight-headline"
            >
              <Spinner className="h-5 w-5" />
              <span className="text-sm">Reading the engine…</span>
            </div>
          )}

          {state.phase === 'error' && (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 px-4 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-tint text-slate-soft">
                <Icon name="info" size={18} />
              </div>
              <p
                className="max-w-xs text-sm leading-relaxed text-ink-soft"
                id="insight-headline"
              >
                Could not put an explanation together for this one.
              </p>
              <button className="btn-ghost" onClick={retry}>
                <Icon name="refresh" size={15} /> Try again
              </button>
            </div>
          )}

          {state.phase === 'loaded' && <Loaded insight={state.insight} />}
        </div>
      </section>
    </div>
  );
}
