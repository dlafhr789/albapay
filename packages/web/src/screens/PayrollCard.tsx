import { usePayroll } from '../api/hooks';
import { ApiRequestError } from '../api/client';
import { formatMonth, formatNumber, formatWon } from '../lib/format';
import { splitGross } from '../lib/payroll';
import { useStoredChoice } from '../lib/preferences';
import { Link } from '../lib/router';
import { ChevronRight } from '../ui/icons';

const MODES = ['gross', 'net'] as const;
type Mode = (typeof MODES)[number];

function shortDate(date: string): string {
  return `${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}`;
}

/**
 * 달력 위의 이번 달 급여 요약. 세전과 실수령(세후) 중 고른 값을 크게 보이고, 고른 값은 이 기기에 기억한다.
 * 세전일 때 막대는 확정분이 세전에서 차지하는 비율이다. 공제는 기간 전체 세전에 매기므로 실수령은 확정·예상으로 나누지 않는다.
 */
export function PayrollCard({ month, showLink = false }: { month: string; showLink?: boolean }) {
  const payroll = usePayroll(month);
  const [mode, setMode] = useStoredChoice<Mode>('albapay.payCardMode', MODES, 'gross');
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
  const amount = data ? (mode === 'net' ? data.net : data.gross) : null;

  return (
    <section className="card pay-card">
      <div className="pay-card-head">
        <span>
          {formatMonth(month)} 급여{data ? ` · ${shortDate(data.period.start)} – ${shortDate(data.period.end)}` : ''}
        </span>
        <div role="group" aria-label="금액 기준" className="pill-toggle">
          <button type="button" aria-pressed={mode === 'gross'} onClick={() => setMode('gross')}>
            세전
          </button>
          <button type="button" aria-pressed={mode === 'net'} onClick={() => setMode('net')}>
            실수령
          </button>
        </div>
      </div>
      <Link to={`/payroll?period=${month}`} className="pay-card-body" aria-label={`${formatMonth(month)} 정산 보기`}>
        <div className="pay-card-amount">
          {amount === null ? '—' : formatNumber(amount)}
          <span>원</span>
        </div>
        {mode === 'gross' ? (
          <>
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
          </>
        ) : (
          <div className="pay-card-legend">
            <span>세전 {data ? formatWon(data.gross) : '—'}</span>
            <span>공제 {data ? `−${formatWon(data.deductionTotal)}` : '—'}</span>
          </div>
        )}
      </Link>
      {data?.locked && <span className="badge badge--primary pay-card-locked">확정한 정산</span>}
      {showLink && (
        <Link to={`/payroll?period=${month}`} className="pay-card-more">
          정산 자세히 <ChevronRight size={16} />
        </Link>
      )}
    </section>
  );
}
