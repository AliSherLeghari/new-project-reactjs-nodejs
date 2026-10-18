import { useEffect, useRef, useState } from 'react';
import { SearchError, searchRepositories } from './api';
import type { SearchRequest, SearchResult } from './types';

type SearchState =
  | { status: 'idle' }
  | { status: 'loading'; request: SearchRequest }
  | { status: 'success'; request: SearchRequest; result: SearchResult }
  | { status: 'error'; request: SearchRequest; error: SearchError };

export function useRepositorySearch() {
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  const [retryAt, setRetryAt] = useState(0);
  const [clock, setClock] = useState(Date.now);
  const active = useRef<{ controller: AbortController; key: string } | null>(
    null,
  );
  const generation = useRef(0);
  const blockedUntil = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      active.current?.controller.abort();
    },
    [],
  );
  useEffect(() => {
    if (retryAt <= clock) return;
    // This timer updates only local UI; it never makes a request.
    const timer = window.setTimeout(
      () => setClock(Date.now()),
      Math.min(retryAt - Date.now(), 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [retryAt, clock]);

  async function run(request: SearchRequest) {
    if (Date.now() < blockedUntil.current) return;
    const key = JSON.stringify(request);
    if (active.current?.key === key) return;
    active.current?.controller.abort();
    const controller = new AbortController();
    const id = ++generation.current;
    active.current = { controller, key };
    setState({ status: 'loading', request });
    try {
      const result = await searchRepositories(request, controller.signal);
      if (id === generation.current && !controller.signal.aborted)
        setState({ status: 'success', request, result });
    } catch (error) {
      if (id !== generation.current || controller.signal.aborted) return;
      const failure =
        error instanceof SearchError
          ? error
          : new SearchError('Search failed. Please try again.');
      if (failure.retryAt) {
        blockedUntil.current = failure.retryAt;
        setClock(Date.now());
        setRetryAt(failure.retryAt);
      }
      setState({ status: 'error', request, error: failure });
    } finally {
      if (id === generation.current) active.current = null;
    }
  }
  return { state, run, coolingDown: retryAt > clock, retryAt };
}
