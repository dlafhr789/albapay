import { addDays, makeDate, type LocalDate } from './date';
import { PayrollConfigError } from './errors';
import type { Period } from './types';

const YEAR_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

function assertStartDay(startDay: number): void {
  // 29~31일은 2월에 없어서 기간 경계가 깨진다.
  if (!Number.isInteger(startDay) || startDay < 1 || startDay > 28) {
    throw new PayrollConfigError(
      'INVALID_PERIOD_START_DAY',
      `정산 시작일은 1~28 사이의 정수여야 합니다: ${startDay}`,
    );
  }
}

function periodFrom(year: number, month: number, startDay: number): Period {
  return {
    start: makeDate(year, month, startDay),
    end: addDays(makeDate(year, month + 1, startDay), -1),
  };
}

/** `yearMonth`(`YYYY-MM`)에 시작하는 정산 기간 */
export function periodStartingIn(yearMonth: string, startDay: number): Period {
  assertStartDay(startDay);
  const match = YEAR_MONTH_PATTERN.exec(yearMonth);
  if (!match) throw new RangeError(`Invalid year-month: ${yearMonth}`);
  return periodFrom(Number(match[1]), Number(match[2]), startDay);
}

/** `date`가 속한 정산 기간 */
export function periodContaining(date: LocalDate, startDay: number): Period {
  assertStartDay(startDay);
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return day >= startDay
    ? periodFrom(year, month, startDay)
    : periodFrom(year, month - 1, startDay);
}
