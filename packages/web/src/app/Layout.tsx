import type { ReactNode } from 'react';
import { Link, useLocation } from '../lib/router';
import { CalendarIcon, ReceiptIcon, RepeatIcon, SlidersIcon, WalletIcon } from '../ui/icons';

const TABS = [
  { to: '/', label: '달력', longLabel: '달력', icon: CalendarIcon, match: ['/', '/day'] },
  { to: '/payroll', label: '정산', longLabel: '정산', icon: ReceiptIcon, match: ['/payroll'] },
  { to: '/rules', label: '반복', longLabel: '반복 근무', icon: RepeatIcon, match: ['/rules'] },
  { to: '/settings', label: '설정', longLabel: '설정', icon: SlidersIcon, match: ['/settings'] },
] as const;

function isActive(path: string, match: readonly string[]): boolean {
  return match.some((prefix) => (prefix === '/' ? path === '/' : path === prefix || path.startsWith(`${prefix}/`)));
}

/**
 * 휴대폰에서는 아래 탭, 컴퓨터(1024px 이상)에서는 왼쪽 사이드바로 메뉴를 보여 준다.
 * 둘 다 그려 두고 CSS로 하나만 보이게 해서, 창 크기가 바뀌어도 화면 상태가 그대로다.
 */
export function Layout({ children, tabs = true, summary }: { children: ReactNode; tabs?: boolean; summary?: ReactNode }) {
  const { path } = useLocation();
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="welcome-mark sidebar-mark">
            <WalletIcon size={18} />
          </span>
          알바페이
        </div>
        <nav aria-label="메뉴">
          {TABS.map(({ to, longLabel, icon: Icon, match }) => (
            <Link key={to} to={to} aria-current={isActive(path, match) ? 'page' : undefined}>
              <Icon size={20} />
              {longLabel}
            </Link>
          ))}
        </nav>
        {summary}
      </aside>
      <main className="main">{children}</main>
      {tabs && (
        <nav aria-label="메뉴" className="tabbar">
          {TABS.map(({ to, label, icon: Icon, match }) => (
            <Link key={to} to={to} aria-current={isActive(path, match) ? 'page' : undefined}>
              <Icon />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
