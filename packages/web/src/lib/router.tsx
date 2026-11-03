import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

// 화면이 몇 개 안 돼서 라우팅 라이브러리 없이 History API로 직접 처리한다.
// 배포 환경에서는 CloudFront 함수가 확장자 없는 경로를 index.html로 돌려줘서 새로 고쳐도 같은 화면이 열린다.

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

if (typeof window !== 'undefined') window.addEventListener('popstate', notify);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): string {
  return window.location.pathname + window.location.search;
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (to === snapshot()) return;
  if (options.replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  window.scrollTo(0, 0);
  notify();
}

export interface Location {
  path: string;
  query: URLSearchParams;
}

export function useLocation(): Location {
  const href = useSyncExternalStore(subscribe, snapshot, () => '/');
  const url = new URL(href, 'http://local');
  return { path: url.pathname, query: url.searchParams };
}

/** `/shift/:date/:id` 같은 패턴과 경로를 맞춰 본다. 맞으면 매개변수, 아니면 null */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const expected = pattern.split('/').filter(Boolean);
  const actual = path.split('/').filter(Boolean);
  if (expected.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (const [index, part] of expected.entries()) {
    const value = actual[index] ?? '';
    if (part.startsWith(':')) params[part.slice(1)] = decodeURIComponent(value);
    else if (part !== value) return null;
  }
  return params;
}

export function withQuery(path: string, query: Record<string, string | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string; replace?: boolean };

export function Link({ to, replace, onClick, ...rest }: LinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to, replace ? { replace } : {});
  }
  return <a href={to} onClick={handleClick} {...rest} />;
}
