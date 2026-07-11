/**
 * Wraps any element with an unobtrusive "explain this" affordance (v2 §H):
 * a small circled-i that appears on hover/focus (always visible on touch,
 * see .explain-i in index.css) and opens the global Insight panel. The button
 * is its own target — it stops propagation so the wrapped element's existing
 * click behaviour (rows, links, cards) is untouched.
 */

import type { MouseEvent, ReactNode } from 'react';
import type { InsightRequest } from '../types/api';
import { useInsight } from './InsightContext';
import { Icon } from '../components/layout/icons';

export function Explainable({
  subject,
  label,
  children,
  className = '',
  iconSize = 13,
}: {
  subject: InsightRequest;
  /** Accessible name, e.g. "7-day ET0" → "Explain: 7-day ET0". */
  label: string;
  children: ReactNode;
  className?: string;
  iconSize?: number;
}) {
  const { openInsight } = useInsight();

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    openInsight(subject);
  };

  return (
    <span className={`explain-wrap ${className}`}>
      {children}
      <button
        type="button"
        className="explain-i no-print"
        aria-label={`Explain: ${label}`}
        aria-haspopup="dialog"
        title={`Explain: ${label}`}
        onClick={onClick}
        // A real <button>, so Enter/Space activate natively; stop the keys and
        // pointer from reaching row-level handlers underneath.
        onKeyDown={(e) => e.stopPropagation()}
        onKeyUp={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Icon name="info" size={iconSize} />
      </button>
    </span>
  );
}
