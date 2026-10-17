import { useEffect, useRef, useState } from 'react';
import { SearchError } from '../search/api';

type State<T> =
  | { key: string; status: 'loading' | 'paused' }
  | { key: string; status: 'success'; value: T }
  | { key: string; status: 'error'; error: SearchError };
// Two detail-page resources share cancellation, retry, and cooldown behavior.
export function useResource<T>(
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
  cooldown: { until: number; block: (until: number) => void },
) {
  const [state, setState] = useState<State<T>>({
    key: key ?? '',
    status: 'loading',
  });
  const [attempt, setAttempt] = useState(0);
  const loader = useRef(load);
  loader.current = load;
  const gate = useRef(cooldown);
  gate.current = cooldown;
  useEffect(() => {
    if (key === null) return;
    if (gate.current.until > Date.now()) {
      setState({ key, status: 'paused' });
      return;
    }
    const controller = new AbortController();
    let active = true;
    setState({ key, status: 'loading' });
    // Skip StrictMode's immediately discarded effect before spending a network request.
    Promise.resolve()
      .then(() => {
        if (!active) return;
        return loader.current(controller.signal);
      })
      .then((value) => {
        if (active && value !== undefined)
          setState({ key, status: 'success', value });
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        const failure =
          error instanceof SearchError
            ? error
            : new SearchError(
                'Repository data is unavailable. Please try again.',
              );
        if (failure.retryAt) gate.current.block(failure.retryAt);
        setState({ key, status: 'error', error: failure });
      });
    return () => {
      active = false;
      controller.abort();
    };
    // Cooldown expiry never initiates a request: retry must be explicit.
  }, [key, attempt]);
  return {
    state:
      state.key === key
        ? state
        : { key: key ?? '', status: 'loading' as const },
    retry: () => {
      if (gate.current.until <= Date.now())
        setAttempt((current) => current + 1);
    },
  };
}

export function useCooldown() {
  const [until, setUntil] = useState(0);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    if (until <= clock) return;
    const timer = window.setTimeout(
      () => setClock(Date.now()),
      Math.min(until - Date.now(), 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [until, clock]);
  return {
    until,
    blocked: until > clock,
    block: (next: number) => {
      setClock(Date.now());
      setUntil((current) => Math.max(current, next));
    },
  };
}
