import { todayInSeoul, type LocalDate } from '@albapay/shared';
import { monthOf, useShifts } from '../api/hooks';
import { chipFor, monthCells, type CalendarCell } from '../lib/calendar';
import { formatMonthDay, shiftMonth, weekdayName } from '../lib/format';
import { useIsDesktop } from '../lib/media';
import { navigate, useLocation, withQuery } from '../lib/router';
import { WEEK_ORDER } from '../lib/rules';
import { ErrorAlert } from '../ui/controls';
import { ChevronLeft, ChevronRight, PlusIcon } from '../ui/icons';
import { toClockTime } from '@albapay/shared';
import { DayPanel } from './DayPanel';
import { PayrollCard } from './PayrollCard';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_CHIPS = 2;

function Cell({ cell, today, selected, onOpen }: { cell: CalendarCell; today: LocalDate; selected: boolean; onOpen: () => void }) {
  const chips = cell.shifts
    .map((shift) => ({ shift, chip: chipFor(shift, today) }))
    .filter((entry): entry is { shift: (typeof entry)['shift']; chip: NonNullable<(typeof entry)['chip']> } => entry.chip !== null);
  const label = `${formatMonthDay(cell.date)}${chips.length ? `, 근무 ${chips.length}개` : ''}`;

  return (
    <button
      type="button"
      className={`cell${cell.inMonth ? '' : ' cell--muted'}${selected ? ' cell--selected' : ''}`}
      aria-label={label}
      aria-current={cell.today ? 'date' : undefined}
      onClick={onOpen}
    >
      <span className={`cell-day${cell.today ? ' cell-day--today' : ''}`}>{cell.day}</span>
      {chips.slice(0, MAX_CHIPS).map(({ shift, chip }) => (
        <span key={shift.id} className={`chip chip--${chip.kind}`}>
          <span className="chip-short">{chip.label}</span>
          <span className="chip-long">
            {chip.kind === 'absent' ? '결근' : `${toClockTime(shift.actualStart ?? shift.plannedStart)}–${toClockTime(shift.actualEnd ?? shift.plannedEnd)}`}
          </span>
        </span>
      ))}
      {chips.length > MAX_CHIPS && <span className="chip-more">+{chips.length - MAX_CHIPS}</span>}
    </button>
  );
}

export function Calendar() {
  const { query } = useLocation();
  const isDesktop = useIsDesktop();
  const today = todayInSeoul();
  const requested = query.get('month');
  const selectedDate = query.get('date');
  const month = requested && MONTH_PATTERN.test(requested) ? requested : (selectedDate?.slice(0, 7) ?? monthOf(today));
  const shifts = useShifts(month);
  const cells = monthCells(month, shifts.data ?? [], today);

  function open(date: LocalDate, shift?: string) {
    if (isDesktop) navigate(withQuery('/', { month, date, shift }), { replace: true });
    else navigate(withQuery(`/day/${date}`, { shift }));
  }

  return (
    <div className="page page--wide calendar-page">
      <div className="page-header">
        <h1 className="page-title">
          {Number(month.slice(5, 7))}월<small>{month.slice(0, 4)}</small>
        </h1>
        <div className="calendar-actions">
          <button type="button" className="icon-button" aria-label="이전 달" onClick={() => navigate(withQuery('/', { month: shiftMonth(month, -1) }))}>
            <ChevronLeft />
          </button>
          <button type="button" className="icon-button" aria-label="다음 달" onClick={() => navigate(withQuery('/', { month: shiftMonth(month, 1) }))}>
            <ChevronRight />
          </button>
          {month !== monthOf(today) && (
            <button type="button" className="button button--secondary button--small" onClick={() => navigate('/')}>
              오늘
            </button>
          )}
          <button type="button" className="icon-button icon-button--solid" aria-label="근무 추가" onClick={() => open(selectedDate ?? today, 'new')}>
            <PlusIcon />
          </button>
        </div>
      </div>

      <div className="calendar-layout">
        <div className="calendar-main">
          <div className="calendar-pay-mobile">
            <PayrollCard month={month} />
          </div>
          <section className="card calendar" aria-label={`${Number(month.slice(5, 7))}월 근무 달력`}>
            <div className="calendar-weekdays" aria-hidden="true">
              {WEEK_ORDER.map((day) => (
                <span key={day}>{weekdayName(day)}</span>
              ))}
            </div>
            <div className="calendar-grid">
              {cells.map((cell) => (
                <Cell key={cell.date} cell={cell} today={today} selected={isDesktop && cell.date === selectedDate} onOpen={() => open(cell.date)} />
              ))}
            </div>
          </section>
          <ErrorAlert error={shifts.error} />
          <div className="legend">
            <span>
              <i className="legend-swatch legend-swatch--worked" />
              근무함
            </span>
            <span>
              <i className="legend-swatch legend-swatch--planned" />
              예정
            </span>
            <span>
              <i className="legend-swatch legend-swatch--extra" />
              대타·추가
            </span>
          </div>
        </div>

        {isDesktop && (
          <aside className="calendar-side">
            <PayrollCard month={month} showLink />
            {selectedDate ? (
              <section className="card">
                <DayPanel
                  date={selectedDate}
                  selected={query.get('shift')}
                  onSelect={(shift) => open(selectedDate, shift)}
                  onDone={() => navigate(withQuery('/', { month, date: selectedDate }), { replace: true })}
                  onClose={() => navigate(withQuery('/', { month }), { replace: true })}
                />
              </section>
            ) : (
              <p className="note">날짜를 누르면 그날 근무를 보고 고칠 수 있어요.</p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

/** 휴대폰에서 하루의 근무를 여는 화면 */
export function DayScreen({ date }: { date: LocalDate }) {
  const { query } = useLocation();
  const back = withQuery('/', { month: date.slice(0, 7) });
  return (
    <div className="page page--bare">
      <button type="button" className="back-link link-button" onClick={() => navigate(back)}>
        <ChevronLeft size={22} />
        {Number(date.slice(5, 7))}월
      </button>
      <DayPanel
        date={date}
        selected={query.get('shift')}
        onSelect={(shift) => navigate(withQuery(`/day/${date}`, { shift }), { replace: true })}
        onDone={() => navigate(back)}
      />
    </div>
  );
}
