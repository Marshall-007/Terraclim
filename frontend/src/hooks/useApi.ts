import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { apiMode } from '../services/api';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

/**
 * Runs an async fetcher and tracks loading/error/data. `deps` re-runs it.
 * The fetcher never throws in practice (the client falls back to mocks), but
 * we still surface errors so screens can render a real error state.
 */
export function useAsync<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[] = [],
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);

  const run = useCallback(fetcher, deps);

  useEffect(() => {
    // `active` guards against setting state from a stale request: if `deps`
    // change (or reload() fires) before this one resolves, the cleanup below
    // flips it false and the late response is dropped instead of clobbering
    // newer state.
    let active = true;
    setLoading(true);
    setError(null);
    run()
      .then((res) => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, nonce]);

  // reload() has no real dependency to change, so it bumps this counter to
  // force the effect above to re-run on demand.
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload };
}

/** Subscribe to whether the app is currently serving bundled demo data. */
export function useDemoMode(): boolean {
  return useSyncExternalStore(
    (cb) => apiMode.subscribe(() => cb()),
    () => apiMode.isDemo(),
    () => false,
  );
}
