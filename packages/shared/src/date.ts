/** `YYYY-MM-DD`. 시간대 없이 서울 기준 달력 날짜로 해석한다. */
export type LocalDate = string;

/** `YYYY-MM-DDTHH:mm`. 오프셋 없이 서울 시각으로 해석한다. */
export type LocalDateTime = string;

/** 0 = 일요일, 1 = 월요일, …, 6 = 토요일 */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const MS_PER_DAY = 86_400_000;
const MINUTES_PER_DAY = 1_440;
// 한국은 서머타임이 없어서 고정 오프셋으로 계산해도 정확하다.
const SEOUL_OFFSET_MS = 9 * 3_600_000;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;

/** 1970-01-01부터 지난 일수. 날짜 계산을 정수로만 하기 위해 쓴다. */
export function toDayNumber(date: LocalDate): number {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new RangeError(`Invalid LocalDate: ${date}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new RangeError(`Invalid LocalDate: ${date}`);
  }
  return ms / MS_PER_DAY;
}

export function fromDayNumber(dayNumber: number): LocalDate {
  return new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10);
}

/** 연·월·일로 날짜를 만든다. 월이 12를 넘으면 다음 해로 넘어간다(13월 → 다음 해 1월). */
export function makeDate(year: number, month: number, day: number): LocalDate {
  return fromDayNumber(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromDayNumber(toDayNumber(date) + days);
}

export function dayOfWeek(date: LocalDate): DayOfWeek {
  // 1970-01-01은 목요일(4)이다.
  return ((((toDayNumber(date) + 4) % 7) + 7) % 7) as DayOfWeek;
}

export function startOfWeek(date: LocalDate, weekStartsOn: DayOfWeek): LocalDate {
  const offset = (dayOfWeek(date) - weekStartsOn + 7) % 7;
  return addDays(date, -offset);
}

export function isBetween(date: LocalDate, from: LocalDate, to: LocalDate): boolean {
  return from <= date && date <= to;
}

/** 1970-01-01T00:00부터 지난 분. 오프셋 없이 로컬 시각으로 읽는다. */
export function toMinuteNumber(dateTime: LocalDateTime): number {
  const match = DATE_TIME_PATTERN.exec(dateTime);
  if (!match) throw new RangeError(`Invalid LocalDateTime: ${dateTime}`);
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 23 || minutes > 59) throw new RangeError(`Invalid LocalDateTime: ${dateTime}`);
  return toDayNumber(match[1] as LocalDate) * MINUTES_PER_DAY + hours * 60 + minutes;
}

export function minutesBetween(start: LocalDateTime, end: LocalDateTime): number {
  return toMinuteNumber(end) - toMinuteNumber(start);
}

/**
 * 서울 기준 오늘 날짜. Lambda는 UTC로 실행되므로 `new Date()`만 쓰면
 * 서울 시각 00:00~08:59 사이에 하루 전 날짜가 나온다.
 */
export function todayInSeoul(now: Date = new Date()): LocalDate {
  return fromDayNumber(Math.floor((now.getTime() + SEOUL_OFFSET_MS) / MS_PER_DAY));
}
