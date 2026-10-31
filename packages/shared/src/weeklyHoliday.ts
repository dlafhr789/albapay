import { addDays, isBetween, startOfWeek, type DayOfWeek, type LocalDate } from './date';
import { wageOn } from './history';
import { contractMinutes, paidMinutes } from './shift';
import type { PayrollSettings, Period, Shift, WageEntry, Won } from './types';

/** 주 15시간 */
export const WEEKLY_HOLIDAY_THRESHOLD_MINUTES = 900;
/** 주 40시간. 이보다 많이 일해도 주휴수당은 8시간분까지만 준다. */
export const WEEKLY_HOLIDAY_CAP_MINUTES = 2_400;

const AVERAGE_WINDOW_WEEKS = 4;

export interface WeeklyHolidayWeek {
  weekStart: LocalDate;
  weekEnd: LocalDate;
  /** 그 주 계약 근무의 예정 시간(분) */
  contractMinutes: number;
  /** 판정에 쓴 평균. 4주 평균 모드면 직전 4주(입사 전 주 제외) 평균 */
  averageContractMinutes: number;
  averagedWeeks: number;
  /** 계약 근무가 있고 결근이 없음 */
  attended: boolean;
  eligible: boolean;
  /** 주휴로 인정되는 시간(분). min(계약 근무, 40시간) ÷ 5 */
  holidayMinutes: number;
  amount: Won;
  /** 주가 끝났으면 true. 끝나기 전이면 예상분 */
  final: boolean;
  /** 참고용: 대타·연장까지 포함한 실제 근무 시간과 그 평균 */
  actualMinutes: number;
  averageActualMinutes: number;
}

/** 마지막 날이 정산 기간 안에 있는 주들. 주휴수당은 주의 마지막 날이 속한 기간에 귀속된다. */
export function weeksEndingIn(
  period: Period,
  weekStartsOn: DayOfWeek,
): { weekStart: LocalDate; weekEnd: LocalDate }[] {
  const weeks: { weekStart: LocalDate; weekEnd: LocalDate }[] = [];
  let weekStart = startOfWeek(period.start, weekStartsOn);
  let weekEnd = addDays(weekStart, 6);
  while (weekEnd <= period.end) {
    if (weekEnd >= period.start) weeks.push({ weekStart, weekEnd });
    weekStart = addDays(weekStart, 7);
    weekEnd = addDays(weekStart, 6);
  }
  return weeks;
}

function sumOverWeek(
  shifts: readonly Shift[],
  weekStart: LocalDate,
  measure: (shift: Shift) => number,
): number {
  const weekEnd = addDays(weekStart, 6);
  let total = 0;
  for (const shift of shifts) {
    if (isBetween(shift.workDate, weekStart, weekEnd)) total += measure(shift);
  }
  return total;
}

export interface WeeklyHolidayInput {
  /** 정산 기간과, 첫 주 기준 직전 3주까지의 근무 */
  shifts: readonly Shift[];
  wages: readonly WageEntry[];
  settings: PayrollSettings;
  period: Period;
  today: LocalDate;
}

export function calculateWeeklyHoliday(input: WeeklyHolidayInput): WeeklyHolidayWeek[] {
  const { shifts, wages, settings, period, today } = input;
  const windowWeeks =
    settings.weeklyHolidayMode === 'FOUR_WEEK_AVERAGE' ? AVERAGE_WINDOW_WEEKS : 1;

  return weeksEndingIn(period, settings.weekStartsOn).map(({ weekStart, weekEnd }) => {
    const contract = sumOverWeek(shifts, weekStart, contractMinutes);
    const actual = sumOverWeek(shifts, weekStart, paidMinutes);
    const hasAbsence = shifts.some(
      (shift) =>
        shift.kind === 'REGULAR' &&
        shift.status === 'ABSENT' &&
        isBetween(shift.workDate, weekStart, weekEnd),
    );
    const attended = contract > 0 && !hasAbsence;

    // Weeks that ended before the hire date are left out of the average.
    let contractSum = 0;
    let actualSum = 0;
    let averagedWeeks = 0;
    for (let i = 0; i < windowWeeks; i++) {
      const start = addDays(weekStart, -7 * i);
      if (addDays(start, 6) < settings.hireDate) break;
      contractSum += sumOverWeek(shifts, start, contractMinutes);
      actualSum += sumOverWeek(shifts, start, paidMinutes);
      averagedWeeks++;
    }

    const eligible =
      attended &&
      averagedWeeks > 0 &&
      contractSum >= WEEKLY_HOLIDAY_THRESHOLD_MINUTES * averagedWeeks;
    const capped = Math.min(contract, WEEKLY_HOLIDAY_CAP_MINUTES);
    // Same as (contract hours ÷ 40 × 8) × wage, kept in integers until the last division.
    const amount = eligible ? Math.floor((capped * wageOn(wages, weekEnd)) / 300) : 0;

    return {
      weekStart,
      weekEnd,
      contractMinutes: contract,
      averageContractMinutes: averagedWeeks > 0 ? Math.floor(contractSum / averagedWeeks) : 0,
      averagedWeeks,
      attended,
      eligible,
      holidayMinutes: eligible ? Math.floor(capped / 5) : 0,
      amount,
      final: weekEnd < today,
      actualMinutes: actual,
      averageActualMinutes: averagedWeeks > 0 ? Math.floor(actualSum / averagedWeeks) : 0,
    };
  });
}
