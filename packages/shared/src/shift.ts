import { minutesBetween } from './date';
import { PayrollConfigError } from './errors';
import type { Shift } from './types';

function workedMinutes(id: string, start: string, end: string, breakMin: number): number {
  const minutes = minutesBetween(start, end) - breakMin;
  if (minutes <= 0) {
    throw new PayrollConfigError('INVALID_SHIFT', `근무 시간이 0분 이하입니다: ${id}`);
  }
  return minutes;
}

/** 예정 시각 기준 근무 시간(분) */
export function plannedMinutes(shift: Shift): number {
  return workedMinutes(shift.id, shift.plannedStart, shift.plannedEnd, shift.plannedBreakMin);
}

/**
 * 급여를 주는 시간(분). 실제 값이 있으면 실제 값을, 없으면 예정 값을 쓴다.
 * 결근과 빠진 날은 0분이다.
 */
export function paidMinutes(shift: Shift): number {
  if (shift.status === 'ABSENT' || shift.status === 'CANCELLED') return 0;
  return workedMinutes(
    shift.id,
    shift.actualStart ?? shift.plannedStart,
    shift.actualEnd ?? shift.plannedEnd,
    shift.actualBreakMin ?? shift.plannedBreakMin,
  );
}

/**
 * 주휴수당 판정에 쓰는 소정근로 시간(분).
 * 계약 근무의 예정 시간만 센다. 대타·추가 근무와 실제 연장분은 넣지 않는다.
 * 결근한 날도 소정근로에는 들어간다. 빠진 날(CANCELLED)만 제외한다.
 */
export function contractMinutes(shift: Shift): number {
  if (shift.kind !== 'REGULAR' || shift.status === 'CANCELLED') return 0;
  return plannedMinutes(shift);
}
