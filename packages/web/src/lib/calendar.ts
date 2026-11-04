import { addDays, paidMinutes, startOfWeek, type LocalDate, type ShiftRecord } from '@albapay/shared';
import { formatMinutesShort } from './format';

export interface CalendarCell {
  date: LocalDate;
  day: number;
  inMonth: boolean;
  today: boolean;
  shifts: ShiftRecord[];
}

/** 달력은 시안처럼 월요일부터 시작한다. 정산의 주 시작 요일 설정과는 상관없다. */
const CALENDAR_WEEK_START = 1;

/** `yearMonth`를 포함하는 주 전체(5주 또는 6주)의 칸. 근무는 날짜별로 시작 시각 순이다. */
export function monthCells(yearMonth: string, shifts: readonly ShiftRecord[], today: LocalDate): CalendarCell[] {
  const first = `${yearMonth}-01`;
  const byDate = new Map<LocalDate, ShiftRecord[]>();
  for (const shift of shifts) {
    const list = byDate.get(shift.workDate) ?? [];
    list.push(shift);
    byDate.set(shift.workDate, list);
  }

  const cells: CalendarCell[] = [];
  let date = startOfWeek(first, CALENDAR_WEEK_START);
  do {
    for (let i = 0; i < 7; i += 1) {
      cells.push({
        date,
        day: Number(date.slice(8, 10)),
        inMonth: date.startsWith(yearMonth),
        today: date === today,
        shifts: byDate.get(date) ?? [],
      });
      date = addDays(date, 1);
    }
  } while (date.startsWith(yearMonth));
  return cells;
}

export type ChipKind = 'worked' | 'planned' | 'extra' | 'absent';

/**
 * 달력 칸에 보일 근무 표시. 빠진 날(CANCELLED)은 보이지 않는다.
 * 지난 날의 예정 근무는 예정대로 일한 것으로 보고 '근무함'으로 칠한다. 급여 계산도 같은 가정이다.
 * 대타도 일한 근무라서 지났거나 실제 시각을 적었으면 '근무함'으로 칠하고, 아직 오지 않은 대타만 점선으로 구분한다.
 */
export function chipFor(shift: ShiftRecord, today: LocalDate): { kind: ChipKind; label: string } | null {
  if (shift.status === 'CANCELLED') return null;
  if (shift.status === 'ABSENT') return { kind: 'absent', label: '결근' };
  const label = formatMinutesShort(paidMinutes(shift));
  const done = shift.status === 'WORKED' || shift.workDate < today;
  if (done) return { kind: 'worked', label };
  return { kind: shift.kind === 'EXTRA' ? 'extra' : 'planned', label };
}
