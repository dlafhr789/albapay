import {
  addDays,
  findEffective,
  periodContaining,
  startOfWeek,
  todayInSeoul,
  type DeductionItem,
  type DeductionProfile,
  type PayrollResponse,
  type WeeklyHolidayWeek,
} from '@albapay/shared';
import { ApiRequestError } from '../api/client';
import { useConfig, useLockPayroll, usePayroll, useUnlockPayroll } from '../api/hooks';
import { formatMinutes, formatMonthDay, formatNumber, formatWon, shiftMonth } from '../lib/format';
import { splitGross } from '../lib/payroll';
import { Link, navigate, useLocation, withQuery } from '../lib/router';
import { ErrorAlert, Loading } from '../ui/controls';
import { ChevronLeft, ChevronRight } from '../ui/icons';

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const ITEM_LABEL: Record<DeductionItem, string> = {
  BUSINESS_INCOME_TAX: '사업소득세',
  LOCAL_INCOME_TAX: '지방소득세',
  NATIONAL_PENSION: '국민연금',
  HEALTH_INSURANCE: '건강보험',
  LONG_TERM_CARE: '장기요양보험',
  EMPLOYMENT_INSURANCE: '고용보험',
  EARNED_INCOME_TAX: '근로소득세',
};

function percent(ppm: number): string {
  return `${formatNumber(ppm / 10_000)}%`;
}

function deductionTitle(profile: DeductionProfile | undefined): string {
  if (!profile || profile.type === 'NONE') return '공제 없음';
  if (profile.type === 'WITHHOLDING') {
    // 사업소득세율에 지방소득세(사업소득세의 일정 비율)를 더한 실효 세율. 3% + 0.3% = 3.3%
    const total = profile.businessIncomeTaxPpm + (profile.businessIncomeTaxPpm * profile.localIncomeTaxPpm) / 1_000_000;
    return `공제 · ${percent(total)}`;
  }
  return '공제 · 4대보험';
}

function weekStatus(week: WeeklyHolidayWeek, today: string): string {
  if (!week.final) return week.weekStart <= today ? '진행 중' : '예정';
  return week.attended ? '개근' : '결근';
}

function WeekRow({ week, today, averaged }: { week: WeeklyHolidayWeek; today: string; averaged: boolean }) {
  const parts = [`소정 ${formatMinutes(week.contractMinutes)}`];
  if (averaged) parts.push(`4주 평균 ${formatMinutes(week.averageContractMinutes)}`);
  parts.push(weekStatus(week, today));
  const reason = !week.eligible && week.final ? (week.attended ? '주 15시간 미만' : '결근한 주') : null;
  return (
    <div className="row row--tall">
      <span className="row-label">
        <span className="row-strong">
          {formatMonthDay(week.weekStart)} – {formatMonthDay(week.weekEnd)}
        </span>
        <span className="row-sub">{parts.join(' · ')}</span>
      </span>
      <span className="row-label row-label--end">
        <span>{formatWon(week.amount)}</span>
        <span className={`tag${week.final ? ' tag--final' : ''}`}>{reason ?? (week.final ? '확정' : '예상')}</span>
      </span>
    </div>
  );
}

function LockControl({ data, today }: { data: PayrollResponse; today: string }) {
  const lock = useLockPayroll();
  const unlock = useUnlockPayroll();
  const period = data.period.start.slice(0, 7);
  const ended = data.period.end < today;

  if (data.locked) {
    return (
      <div className="section-group">
        <button type="button" className="button button--secondary button--block" disabled={unlock.isPending} onClick={() => unlock.mutate(period)}>
          확정 해제
        </button>
        <p className="hint hint--center">
          {data.lockedAt ? `${formatMonthDay(data.lockedAt.slice(0, 10))}에 확정했어요. ` : ''}확정을 해제해야 이 기간의 근무를 고칠 수 있어요.
        </p>
        <ErrorAlert error={unlock.error} />
      </div>
    );
  }
  return (
    <div className="section-group">
      <button type="button" className="button button--secondary button--block" disabled={!ended || lock.isPending} onClick={() => lock.mutate(period)}>
        급여 받은 뒤 확정하기
      </button>
      <p className="hint hint--center">
        {ended
          ? '확정하면 나중에 설정을 바꿔도 이 기간 금액은 그대로예요.'
          : `정산 기간이 끝난 ${formatMonthDay(addDays(data.period.end, 1))}부터 확정할 수 있어요.`}
      </p>
      <ErrorAlert error={lock.error} />
    </div>
  );
}

export function Payroll() {
  const { query } = useLocation();
  const today = todayInSeoul();
  const config = useConfig();
  const startDay = config.data?.settings?.periodStartDay ?? 1;
  const requested = query.get('period');
  const period = requested && PERIOD_PATTERN.test(requested) ? requested : periodContaining(today, startDay).start.slice(0, 7);
  const payroll = usePayroll(period);

  const notConfigured = payroll.error instanceof ApiRequestError && payroll.error.code === 'NOT_CONFIGURED';
  const data = payroll.data;
  const settings = config.data?.settings;

  return (
    <div className="page">
      <h1 className="page-title">정산</h1>

      <div className="period-nav">
        <button type="button" className="icon-button" aria-label="이전 기간" onClick={() => navigate(withQuery('/payroll', { period: shiftMonth(period, -1) }))}>
          <ChevronLeft />
        </button>
        <span>{data ? `${formatMonthDay(data.period.start)} – ${formatMonthDay(data.period.end)}` : `${Number(period.slice(5, 7))}월`}</span>
        <button type="button" className="icon-button" aria-label="다음 기간" onClick={() => navigate(withQuery('/payroll', { period: shiftMonth(period, 1) }))}>
          <ChevronRight />
        </button>
      </div>

      {notConfigured && (
        <p className="alert alert--info">
          {payroll.error instanceof ApiRequestError ? payroll.error.message : ''} <Link to="/settings">설정하러 가기</Link>
        </p>
      )}
      {!notConfigured && <ErrorAlert error={payroll.error} />}
      {payroll.isPending && <Loading />}

      {data && settings && <PayrollDetail data={data} today={today} averaged={settings.weeklyHolidayMode === 'FOUR_WEEK_AVERAGE'} weekStartsOn={settings.weekStartsOn} deductions={config.data?.deductions ?? []} />}
    </div>
  );
}

function PayrollDetail({
  data,
  today,
  averaged,
  weekStartsOn,
  deductions,
}: {
  data: PayrollResponse;
  today: string;
  averaged: boolean;
  weekStartsOn: Parameters<typeof startOfWeek>[1];
  deductions: readonly DeductionProfile[];
}) {
  const split = splitGross(data);
  const profile = findEffective(deductions, data.period.end);
  const lastWeekStart = startOfWeek(data.period.end, weekStartsOn);
  const lastWeekEnd = addDays(lastWeekStart, 6);
  const spillsOver = lastWeekEnd > data.period.end;

  return (
    <>
      <section className="card net-card">
        <div className="net-card-head">
          <span>{data.locked ? '실수령' : '실수령 예상'}</span>
          <span className={`badge${data.locked ? ' badge--primary' : ''}`}>{data.locked ? '확정' : '미확정'}</span>
        </div>
        <div className="net-card-amount">
          {formatNumber(data.net)}
          <span>원</span>
        </div>
        <div className="net-card-sub">
          세전 {formatWon(data.gross)} − 공제 {formatWon(data.deductionTotal)}
        </div>
        <div className="split">
          <div className="split-box split-box--confirmed">
            <div>확정</div>
            <div>{formatWon(split.confirmed)}</div>
          </div>
          <div className="split-box">
            <div>예상</div>
            <div>{formatWon(split.expected)}</div>
          </div>
        </div>
      </section>

      {data.warnings.map((warning) => (
        <p key={warning} className="alert alert--info">
          {warning}
        </p>
      ))}

      <section className="card breakdown">
        <div className="row">
          <h2 className="row-title">기본급</h2>
          <span className="row-title">{formatWon(data.base.totalPay)}</span>
        </div>
        <div className="row">
          <span className="row-muted">확정 · {formatMinutes(data.base.confirmedMinutes)}</span>
          <span>{formatWon(data.base.confirmedPay)}</span>
        </div>
        <div className="row">
          <span className="row-muted">예상 · {formatMinutes(data.base.expectedMinutes)}</span>
          <span>{formatWon(data.base.expectedPay)}</span>
        </div>
      </section>

      <section className="card breakdown">
        <div className="row">
          <h2 className="row-title">주휴수당</h2>
          <span className="row-title">{formatWon(data.weeklyHolidayTotal)}</span>
        </div>
        {data.weeklyHoliday.length === 0 && <p className="empty">이 기간에 끝나는 주가 없어요.</p>}
        {data.weeklyHoliday.map((week) => (
          <WeekRow key={week.weekStart} week={week} today={today} averaged={averaged} />
        ))}
        <p className="note breakdown-note">
          주휴수당은 주의 마지막 날이 속한 기간에 들어가요.
          {spillsOver && ` ${formatMonthDay(lastWeekStart)} – ${formatMonthDay(lastWeekEnd)} 주는 다음 정산에 포함돼요.`}
        </p>
      </section>

      <section className="card breakdown">
        <div className="row">
          <h2 className="row-title">{deductionTitle(profile)}</h2>
          <span className="row-title">{data.deductionTotal > 0 ? `−${formatWon(data.deductionTotal)}` : formatWon(0)}</span>
        </div>
        {data.deductions.map((line) => (
          <div key={line.item} className="row">
            <span className="row-muted">{ITEM_LABEL[line.item]}</span>
            <span>{formatWon(line.amount)}</span>
          </div>
        ))}
      </section>

      <LockControl data={data} today={today} />
    </>
  );
}
