import type { PayrollResult } from '@albapay/shared';

/**
 * 세전 금액을 확정분과 예상분으로 나눈다.
 * 확정분은 오늘 이전 근무의 기본급과 이미 끝난 주의 주휴수당이다. 나머지는 예정대로 일한다고 가정한 예상분이다.
 */
export function splitGross(result: PayrollResult): { gross: number; confirmed: number; expected: number } {
  const confirmedHoliday = result.weeklyHoliday.filter((week) => week.final).reduce((sum, week) => sum + week.amount, 0);
  const confirmed = result.base.confirmedPay + confirmedHoliday;
  return { gross: result.gross, confirmed, expected: result.gross - confirmed };
}
