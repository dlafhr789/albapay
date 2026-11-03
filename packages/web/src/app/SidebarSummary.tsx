import { periodContaining, todayInSeoul } from '@albapay/shared';
import { useConfig, usePayroll } from '../api/hooks';
import { formatMonth, formatWon } from '../lib/format';

/** 컴퓨터 화면 사이드바 아래의 이번 정산 기간 실수령 예상 */
export function SidebarSummary() {
  const config = useConfig();
  const startDay = config.data?.settings?.periodStartDay;
  const period = startDay ? periodContaining(todayInSeoul(), startDay).start.slice(0, 7) : null;
  return period ? <Summary period={period} /> : null;
}

function Summary({ period }: { period: string }) {
  const payroll = usePayroll(period);
  if (!payroll.data) return null;
  return (
    <div className="sidebar-summary">
      <div>{formatMonth(period)} 실수령 {payroll.data.locked ? '' : '예상'}</div>
      <div>{formatWon(payroll.data.net)}</div>
    </div>
  );
}
