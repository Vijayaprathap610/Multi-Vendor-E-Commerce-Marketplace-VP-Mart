import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeError } from '../services/api.js';

// Runs an async loader and tracks { data, loading, error }. Re-runs when `deps` change and
// ignores results from outdated runs, so fast filter changes never show stale data.
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const run = useRef(0);
  const load = useCallback(() => {
    const id = ++run.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    return Promise.resolve()
      .then(loader)
      .then((data) => id === run.current && setState({ data, loading: false, error: null }))
      .catch(
        (err) =>
          id === run.current &&
          setState({ data: null, loading: false, error: normalizeError(err) }),
      );
    // The caller owns the dependency list on purpose (it decides when to reload).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load };
}
