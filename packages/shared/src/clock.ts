import { addDays, type LocalDate, type LocalDateTime } from './date';

/** `HH:mm`. 날짜 없는 하루 안의 시각 */
export type ClockTime = string;

/** 입력 화면에서 받는 근무 시간. 종료가 시작과 같거나 이르면 다음 날로 본다. */
export interface ClockRange {
  start: ClockTime;
  end: ClockTime;
  /** 무급 휴게(분) */
  breakMin: number;
}

const CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MINUTES_PER_DAY = 1_440;

export function isClockTime(value: string): boolean {
  return CLOCK_PATTERN.test(value);
}

function minuteOfDay(time: ClockTime): number {
  const match = CLOCK_PATTERN.exec(time);
  if (!match) throw new RangeError(`Invalid ClockTime: ${time}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** 시작부터 종료까지의 분. 종료가 시작과 같거나 이르면 다음 날 종료로 계산한다. */
export function clockRangeMinutes(start: ClockTime, end: ClockTime): number {
  const diff = minuteOfDay(end) - minuteOfDay(start);
  return diff > 0 ? diff : diff + MINUTES_PER_DAY;
}

export function toLocalDateTime(date: LocalDate, time: ClockTime): LocalDateTime {
  minuteOfDay(time);
  return `${date}T${time}`;
}

/** 근무 날짜 기준의 시각 범위를 실제 날짜가 붙은 시각으로 바꾼다. 밤샘 근무는 종료가 다음 날이 된다. */
export function toLocalRange(
  workDate: LocalDate,
  range: ClockRange,
): { start: LocalDateTime; end: LocalDateTime; breakMin: number } {
  const endDate = minuteOfDay(range.end) > minuteOfDay(range.start) ? workDate : addDays(workDate, 1);
  return {
    start: toLocalDateTime(workDate, range.start),
    end: toLocalDateTime(endDate, range.end),
    breakMin: range.breakMin,
  };
}

export function toClockTime(dateTime: LocalDateTime): ClockTime {
  return dateTime.slice(11, 16);
}

/** 입력받은 예정·실제 시각 범위를 근무에 저장하는 필드로 바꾼다. */
export function toShiftTimes(input: {
  workDate: LocalDate;
  planned: ClockRange;
  actual: ClockRange | null;
}): {
  plannedStart: LocalDateTime;
  plannedEnd: LocalDateTime;
  plannedBreakMin: number;
  actualStart: LocalDateTime | null;
  actualEnd: LocalDateTime | null;
  actualBreakMin: number | null;
} {
  const planned = toLocalRange(input.workDate, input.planned);
  const actual = input.actual ? toLocalRange(input.workDate, input.actual) : null;
  return {
    plannedStart: planned.start,
    plannedEnd: planned.end,
    plannedBreakMin: planned.breakMin,
    actualStart: actual?.start ?? null,
    actualEnd: actual?.end ?? null,
    actualBreakMin: actual?.breakMin ?? null,
  };
}
