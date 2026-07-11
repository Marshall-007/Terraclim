import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="text-2xl leading-none text-ink sm:text-[28px]">{title}</h1>
        {subtitle && (
          <p className="mt-2 max-w-2xl text-sm text-ink-soft">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Section({
  title,
  hint,
  right,
  children,
  className = '',
}: {
  title?: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base text-ink">{title}</h2>}
            {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  unit,
  delta,
  hint,
  accent,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: string;
  delta?: { value: string; good: boolean };
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-md border border-line bg-raised px-4 py-3">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span
          className="nums text-2xl font-semibold leading-none"
          style={{ color: accent ?? undefined }}
        >
          {value}
        </span>
        {unit && <span className="text-sm text-ink-muted">{unit}</span>}
      </div>
      {(delta || hint) && (
        <div className="mt-1.5 flex items-center gap-2">
          {delta && (
            <span
              className="nums text-xs font-semibold"
              style={{ color: delta.good ? '#006300' : '#b23330' }}
            >
              {delta.value}
            </span>
          )}
          {hint && <span className="text-xs text-ink-muted">{hint}</span>}
        </div>
      )}
    </div>
  );
}

export function KeyValue({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="nums text-sm font-medium text-ink">{children}</span>
    </div>
  );
}
