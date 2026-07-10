import type { ReactNode } from 'react';

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-bordeaux ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-md bg-line/60 ${className}`}
      aria-hidden
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/50 to-transparent" />
    </div>
  );
}

export function LoadingPanel({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[240px] w-full flex-col items-center justify-center gap-3 text-ink-muted">
      <Spinner className="h-5 w-5" />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function ErrorState({
  message = 'Could not load this view.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-critical-tint text-critical">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 8v5M12 16.5v.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </div>
      <p className="max-w-xs text-sm text-ink-soft">{message}</p>
      {onRetry && (
        <button className="btn-ghost" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  icon,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 px-6 text-center">
      {icon && <div className="text-ink-muted">{icon}</div>}
      <p className="text-sm font-medium text-ink-soft">{title}</p>
      {hint && <p className="max-w-xs text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
