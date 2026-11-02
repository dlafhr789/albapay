import type { LocalDate } from '@albapay/shared';
import type { PayslipRecord, Store } from './db/store';
import { ApiError } from './http/errors';

// 확정 기록을 키 하나로 찾지 않고 기간 범위로 비교한다.
// 그래서 확정한 뒤 정산 시작일 설정을 바꿔도 확정한 기간은 계속 잠겨 있다.

export function isLockedDate(payslips: readonly PayslipRecord[], date: LocalDate): boolean {
  return payslips.some((payslip) => payslip.periodStart <= date && date <= payslip.periodEnd);
}

function lockedError(payslip: PayslipRecord, message: string): ApiError {
  return new ApiError(409, 'PERIOD_LOCKED', `확정한 정산 기간(${payslip.periodStart}~${payslip.periodEnd})${message}`);
}

/** 확정한 정산 기간에 속한 날짜가 하나라도 있으면 409를 던진다. */
export async function assertNotLocked(store: Store, dates: readonly LocalDate[]): Promise<void> {
  const payslips = await store.listPayslips();
  const locked = payslips.find((payslip) => dates.some((date) => isLockedDate([payslip], date)));
  if (locked) throw lockedError(locked, '의 근무는 바꿀 수 없습니다. 확정을 먼저 해제하세요.');
}

/** `from`~`to`(양 끝 포함, `to`가 null이면 끝 없음)가 확정한 정산 기간과 겹치면 409를 던진다. */
export async function assertRangeNotLocked(store: Store, from: LocalDate, to: LocalDate | null): Promise<void> {
  const payslips = await store.listPayslips();
  const locked = payslips.find(
    (payslip) => from <= payslip.periodEnd && (to === null || payslip.periodStart <= to),
  );
  if (locked) throw lockedError(locked, '과 겹칩니다. 확정한 기간의 근무는 규칙으로 만들거나 바꿀 수 없습니다.');
}
