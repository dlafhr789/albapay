import { usePayroll } from '../api/hooks';
import { ApiRequestError } from '../api/client';
import { formatMonth, formatNumber, formatWon } from '../lib/format';
import { splitGross } from '../lib/payroll';
import { Link } from '../lib/router';
import { ChevronRight } from '../ui/icons';

function shortDate(date: string): string {
  return `${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}`;
}

/** 달력 위의 이번 달 세전 급여 요약. 막대는 확정분이 세전에서 차지하는 비율이다. */
export function PayrollCard({ month, showLink = false }: { month: string; showLink?: boolean }) {
  const payroll = usePayroll(month);
  const notConfigured = payroll.error instanceof ApiRequestError && payroll.error.code === 'NOT_CONFIGURED';

  if (notConfigured) {
    return (
      <Link to="/settings" className="card pay-card pay-card--empty">
        <span>급여를 계산하려면 시급과 정산 기간이 필요해요.</span>
        <span className="pay-card-cta">
          설정하러 가기 <ChevronRight size={16} />
        </span>
      </Link>
    );
  }

  const data = payroll.data;
  const split = data ? splitGross(data) : null;
  const ratio = split && split.gross > 0 ? Math.round((split.confirmed / split.gross) * 100) : 0;
  const body = (
    <>
      <div className="pay-card-head">
        <span>{formatMonth(month)} 급여 · 세전</span>
        {data && (
          <span>
            {shortDate(data.period.start)} – {shortDate(data.period.end)}
          </span>
        )}
      </div>
      <div className="pay-card-amount">
        {split ? formatNumber(split.gross) : '—'}
        <span>원</span>
      </div>
      <div className="meter" aria-hidden="true">
        <div className="meter-fill" style={{ width: `${ratio}%` }} />
      </div>
      <div className="pay-card-legend">
        <span>
          <i className="dot dot--confirmed" />
          확정 {split ? formatWon(split.confirmed) : '—'}
        </span>
        <span>
          <i className="dot dot--expected" />
          예상 {split ? formatWon(split.expected) : '—'}
        </span>
      </div>
      {data?.locked && <span className="badge badge--primary pay-card-locked">확정한 정산</span>}
    </>
  );

  if (showLink) {
    return (
      <section className="card pay-card">
        {body}
        <Link to={`/payroll?period=${month}`} className="pay-card-more">
          정산 자세히 <ChevronRight size={16} />
        </Link>
      </section>
    );
  }
  return (
    <Link to={`/payroll?period=${month}`} className="card pay-card">
      {body}
    </Link>
  );
}
