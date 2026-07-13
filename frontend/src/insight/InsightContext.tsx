/**
 * Global AI-Insight state (v2 §H). Any element wrapped in <Explainable> calls
 * openInsight(); the provider fetches the explanation and renders the shared
 * panel (right slide-in on desktop, bottom sheet on mobile). The state machine
 * is loading → loaded | error. An error shows a retry card, never crashes.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Insight, InsightRequest } from '../types/api';
import { api } from '../services/api';
import { InsightPanel } from './InsightPanel';

export type InsightState =
  | { phase: 'loading'; request: InsightRequest }
  | { phase: 'loaded'; request: InsightRequest; insight: Insight }
  | { phase: 'error'; request: InsightRequest };

interface InsightContextValue {
  state: InsightState | null;
  openInsight: (request: InsightRequest) => void;
  closeInsight: () => void;
  retry: () => void;
}

const InsightContext = createContext<InsightContextValue | null>(null);

export function InsightProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<InsightState | null>(null);
  // Monotonic ticket so a slow response can never clobber a newer request.
  const seq = useRef(0);

  const openInsight = useCallback((request: InsightRequest) => {
    const ticket = ++seq.current;
    setState({ phase: 'loading', request });
    api
      .postInsight(request)
      .then((insight) => {
        if (seq.current === ticket) setState({ phase: 'loaded', request, insight });
      })
      .catch(() => {
        if (seq.current === ticket) setState({ phase: 'error', request });
      });
  }, []);

  const closeInsight = useCallback(() => {
    seq.current++;
    setState(null);
  }, []);

  const retry = useCallback(() => {
    if (state) openInsight(state.request);
  }, [state, openInsight]);

  const value = useMemo(
    () => ({ state, openInsight, closeInsight, retry }),
    [state, openInsight, closeInsight, retry],
  );

  return (
    <InsightContext.Provider value={value}>
      {children}
      <InsightPanel />
    </InsightContext.Provider>
  );
}

export function useInsight(): InsightContextValue {
  const ctx = useContext(InsightContext);
  if (!ctx) throw new Error('useInsight must be used within <InsightProvider>');
  return ctx;
}
