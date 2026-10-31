import type { DayOfWeek, LocalDate, LocalDateTime } from './date';

/** 계약상 근무(소정근로) / 대타·추가 근무 */
export type ShiftKind = 'REGULAR' | 'EXTRA';

/**
 * - SCHEDULED: 예정 그대로. 지난 날짜면 예정대로 일한 것으로 본다.
 * - WORKED: 실제 시각을 입력함
 * - ABSENT: 결근. 그 주 개근이 깨진다.
 * - CANCELLED: 합의로 빠진 날. 소정근로에서도 빠진다.
 */
export type ShiftStatus = 'SCHEDULED' | 'WORKED' | 'ABSENT' | 'CANCELLED';

export interface Shift {
  id: string;
  /** 시작 시각의 날짜. 밤샘 근무도 시작한 날에 속한다. */
  workDate: LocalDate;
  kind: ShiftKind;
  status: ShiftStatus;
  plannedStart: LocalDateTime;
  plannedEnd: LocalDateTime;
  /** 무급 휴게 시간(분) */
  plannedBreakMin: number;
  actualStart?: LocalDateTime | null | undefined;
  actualEnd?: LocalDateTime | null | undefined;
  actualBreakMin?: number | null | undefined;
}

/** 원 단위 정수 */
export type Won = number;

/** 백만분율 정수. 4.75% → 47_500 */
export type Ppm = number;

export interface WageEntry {
  effectiveFrom: LocalDate;
  hourlyWage: Won;
}

export type WeeklyHolidayMode = 'FOUR_WEEK_AVERAGE' | 'SINGLE_WEEK';

export interface PayrollSettings {
  hireDate: LocalDate;
  /** 정산 기간이 시작하는 날(1~28). 1이면 매월 1일~말일 */
  periodStartDay: number;
  weekStartsOn: DayOfWeek;
  weeklyHolidayMode: WeeklyHolidayMode;
}

export interface Period {
  start: LocalDate;
  end: LocalDate;
}
