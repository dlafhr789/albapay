import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';

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

/** 화면 전환 방향. 더 깊은 화면으로 가면 forward, 돌아오면 back, 탭끼리는 fade */
export type Transition = 'forward' | 'back' | 'fade' | 'none';

/** 하루 근무와 규칙 편집처럼 탭 아래로 들어가는 화면이면 1 */
function depth(path: string): number {
  return /^\/(day|rules)\/[^/]+/.test(path) ? 1 : 0;
}

function defaultTransition(from: string, to: string): Transition {
  if (from === to) return 'none';
  const delta = depth(to) - depth(from);
  return delta > 0 ? 'forward' : delta < 0 ? 'back' : 'fade';
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 주소를 바꾸고 화면을 다시 그린다. 브라우저가 View Transitions API를 지원하면 이전 화면과 새 화면 사이를
 * 애니메이션으로 잇는다. 애니메이션 모양은 <html data-nav>로 CSS에 넘긴다(styles/app.css의 화면 전환).
 * 같은 경로에서 쿼리만 바뀌면(달력의 날짜 선택 등) 애니메이션 없이 바꾼다.
 */
export function navigate(to: string, options: { replace?: boolean; transition?: Transition } = {}): void {
  if (to === snapshot()) return;
  const transition = options.transition ?? defaultTransition(window.location.pathname, new URL(to, window.location.href).pathname);

  const update = () => {
    if (options.replace) window.history.replaceState(null, '', to);
    else window.history.pushState(null, '', to);
    window.scrollTo(0, 0);
    notify();
  };

  if (transition === 'none' || typeof document.startViewTransition !== 'function' || reducedMotion()) {
    update();
    return;
  }
  const root = document.documentElement;
  root.dataset['nav'] = transition;
  // 콜백 안에서 새 화면이 DOM에 다 그려져야 브라우저가 새 화면을 찍는다. 그래서 React 렌더링을 동기로 끝낸다.
  const view = document.startViewTransition(() => flushSync(update));
  void view.finished.finally(() => {
    delete root.dataset['nav'];
  });
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
