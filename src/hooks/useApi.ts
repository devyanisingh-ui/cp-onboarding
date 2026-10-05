import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribe } from '@/services/db';
import { ApiError, errorMessage } from '@/services/errors';
import { useToast } from '@/components/ui';

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
export function onUnauthorized(fn: Listener): () => void {
  unauthorizedListeners.add(fn);
  return () => void unauthorizedListeners.delete(fn);
}
function handleError(e: unknown) {
  if (e instanceof ApiError && e.status === 401) unauthorizedListeners.forEach((l) => l());
}

/**
 * Data fetching with loading / error states. Re-fetches silently whenever the data store
 * changes (a mutation here, or in another tab), which stands in for real-time updates.
 */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    setLoading(true);
    setError(undefined);
    fnRef
      .current()
      .then((d) => my === seq.current && (setData(d), setLoading(false)))
      .catch((e) => {
        handleError(e);
        if (my === seq.current) {
          setError(e);
          setLoading(false);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  useEffect(
    () =>
      subscribe(() => {
        const my = ++seq.current;
        fnRef
          .current()
          .then((d) => {
            if (my === seq.current) {
              setData(d);
              setError(undefined);
              setLoading(false);
            }
          })
          .catch(() => {
            /* keep showing the last good data on background refresh failures */
          });
      }),
    [],
  );

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

/** Wraps a mutation with loading state, field errors and toasts. */
export function useAction<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  opts: { success?: string | ((r: R) => string); onSuccess?: (r: R) => void; errorTitle?: string; silent?: boolean } = {},
) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const run = useCallback(
    async (...args: A): Promise<{ ok: true; value: R } | { ok: false; value?: undefined }> => {
      setLoading(true);
      setFieldErrors({});
      setError(null);
      try {
        const r = await fn(...args);
        const s = optsRef.current.success;
        if (s) toast.success(typeof s === 'function' ? s(r) : s);
        optsRef.current.onSuccess?.(r);
        return { ok: true, value: r };
      } catch (e) {
        handleError(e);
        const msg = errorMessage(e);
        setError(msg);
        if (e instanceof ApiError && e.fieldErrors) setFieldErrors(e.fieldErrors);
        if (!optsRef.current.silent) toast.error(optsRef.current.errorTitle ?? 'Action failed', msg);
        return { ok: false };
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn, toast],
  );
  return { run, loading, fieldErrors, error, clearError: () => setError(null) };
}
