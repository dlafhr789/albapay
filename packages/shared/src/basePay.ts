import { isBetween, type LocalDate } from './date';
import { wageOn } from './history';
import { paidMinutes } from './shift';
import type { Period, Shift, WageEntry, Won } from './types';

export interface BasePay {
  /** 오늘 이전 근무 */
  confirmedMinutes: number;
  confirmedPay: Won;
  /** 오늘 이후 근무. 예정대로 일한다고 가정한 금액 */
  expectedMinutes: number;
  expectedPay: Won;
  totalMinutes: number;
  totalPay: Won;
}

/**
 * 정산 기간에 속한 근무의 기본급. 근무마다 `분 × 그날 시급`을 더하고
 * 마지막에 한 번만 60으로 나눠 원 미만을 버린다.
 * 예상분은 전체에서 확정분을 빼서 구해, 두 금액의 합이 항상 전체와 같다.
 */
export function calculateBasePay(
  shifts: readonly Shift[],
  wages: readonly WageEntry[],
  period: Period,
  today: LocalDate,
): BasePay {
  let totalMinutes = 0;
  let totalWeighted = 0;
  let confirmedMinutes = 0;
  let confirmedWeighted = 0;

  for (const shift of shifts) {
    if (!isBetween(shift.workDate, period.start, period.end)) continue;
    const minutes = paidMinutes(shift);
    if (minutes === 0) continue;
    const weighted = minutes * wageOn(wages, shift.workDate);
    totalMinutes += minutes;
    totalWeighted += weighted;
    if (shift.workDate < today) {
      confirmedMinutes += minutes;
      confirmedWeighted += weighted;
    }
  }

  const totalPay = Math.floor(totalWeighted / 60);
  const confirmedPay = Math.floor(confirmedWeighted / 60);
  return {
    confirmedMinutes,
    confirmedPay,
    expectedMinutes: totalMinutes - confirmedMinutes,
    expectedPay: totalPay - confirmedPay,
    totalMinutes,
    totalPay,
  };
}
