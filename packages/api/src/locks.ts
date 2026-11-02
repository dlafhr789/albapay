import type { LocalDate } from '@albapay/shared';
import type { Store } from './db/store';
import { ApiError } from './http/errors';

/**
 * 확정한 정산 기간에 속한 날짜면 409를 던진다. 확정 기록을 키 하나로 찾지 않고 기간 범위로 비교해서,
 * 확정한 뒤 정산 시작일 설정을 바꿔도 확정한 기간은 계속 잠겨 있다.
 */
export async function assertNotLocked(store: Store, dates: readonly LocalDate[]): Promise<void> {
  const payslips = await store.listPayslips();
  const locked = payslips.find((payslip) =>
    dates.some((date) => payslip.periodStart <= date && date <= payslip.periodEnd),
  );
  if (locked) {
    throw new ApiError(
      409,
      'PERIOD_LOCKED',
      `확정한 정산 기간(${locked.periodStart}~${locked.periodEnd})의 근무는 바꿀 수 없습니다. 확정을 먼저 해제하세요.`,
    );
  }
}
