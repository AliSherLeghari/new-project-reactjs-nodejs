import { useSyncExternalStore, type AnchorHTMLAttributes } from 'react';

type Route =
  | { kind: 'search' }
  | { kind: 'detail'; owner: string; repo: string }
  | { kind: 'missing' };
export function parseRoute(path: string): Route {
  if (path === '/') return { kind: 'search' };
  const match = /^\/repositories\/([^/]+)\/([^/]+)\/?$/.exec(path);
  if (!match) return { kind: 'missing' };
  try {
    const owner = decodeURIComponent(match[1]);
    const repo = decodeURIComponent(match[2]);
    if (
      !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(owner) ||
      owner.includes('--') ||
      !/^[a-z\d_.-]{1,100}$/i.test(repo) ||
      ['.', '..'].includes(repo)
    )
      return { kind: 'missing' };
    return { kind: 'detail', owner, repo };
  } catch {
    return { kind: 'missing' };
  }
}
const subscribe = (listener: () => void) => {
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
};
const snapshot = () => window.location.pathname;
export function useRoute() {
  return parseRoute(useSyncExternalStore(subscribe, snapshot));
}
export function repositoryPath(owner: string, repo: string) {
  return `/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}
export function AppLink({
  href = '/',
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          props.target ||
          new URL(href, location.origin).origin !== location.origin
        )
          return;
        event.preventDefault();
        if (location.pathname !== href) {
          history.pushState(null, '', href);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
      }}
    />
  );
}
