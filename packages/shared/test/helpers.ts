import { addDays, dayOfWeek, type DayOfWeek, type LocalDate } from '../src/date';
import type { PayrollSettings, Shift, WageEntry } from '../src/types';

export const WAGE_10320: WageEntry[] = [{ effectiveFrom: '2026-01-01', hourlyWage: 10_320 }];

export function settings(overrides: Partial<PayrollSettings> = {}): PayrollSettings {
  return {
    hireDate: '2026-01-01',
    periodStartDay: 1,
    weekStartsOn: 1,
    weeklyHolidayMode: 'FOUR_WEEK_AVERAGE',
    ...overrides,
  };
}

let sequence = 0;

/** `end`가 `start`보다 이르거나 같으면 다음 날 끝나는 근무로 만든다. */
export function shift(
  workDate: LocalDate,
  start: string,
  end: string,
  overrides: Partial<Shift> = {},
): Shift {
  const endDate = end <= start ? addDays(workDate, 1) : workDate;
  sequence += 1;
  return {
    id: `shift-${sequence}`,
    workDate,
    kind: 'REGULAR',
    status: 'SCHEDULED',
    plannedStart: `${workDate}T${start}`,
    plannedEnd: `${endDate}T${end}`,
    plannedBreakMin: 0,
    ...overrides,
  };
}

export type Slot = readonly [day: DayOfWeek, start: string, end: string];

/** `from`부터 `to`까지 요일별 근무를 만든다. */
export function weekly(from: LocalDate, to: LocalDate, slots: readonly Slot[]): Shift[] {
  const shifts: Shift[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    for (const [day, start, end] of slots) {
      if (dayOfWeek(date) === day) shifts.push(shift(date, start, end));
    }
  }
  return shifts;
}

export const MON = 1;
export const TUE = 2;
export const WED = 3;
export const THU = 4;
export const FRI = 5;
export const SAT = 6;
export const SUN = 0;
