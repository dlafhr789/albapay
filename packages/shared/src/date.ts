/** `YYYY-MM-DD`. 시간대 없이 서울 기준 달력 날짜로 해석한다. */
export type LocalDate = string;

/** `YYYY-MM-DDTHH:mm`. 오프셋 없이 서울 시각으로 해석한다. */
export type LocalDateTime = string;

/** 0 = 일요일, 1 = 월요일, …, 6 = 토요일 */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const MS_PER_DAY = 86_400_000;
const MINUTES_PER_DAY = 1_440;
// Korea has no daylight saving time, so a fixed offset is exact.
const SEOUL_OFFSET_MS = 9 * 3_600_000;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;

/** Days since 1970-01-01. Lets date arithmetic stay in integers. */
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

/** Builds a date from parts. Month overflow rolls into the next year (month 13 → January). */
export function makeDate(year: number, month: number, day: number): LocalDate {
  return fromDayNumber(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromDayNumber(toDayNumber(date) + days);
}

export function dayOfWeek(date: LocalDate): DayOfWeek {
  // 1970-01-01 was a Thursday (4).
  return ((((toDayNumber(date) + 4) % 7) + 7) % 7) as DayOfWeek;
}

export function startOfWeek(date: LocalDate, weekStartsOn: DayOfWeek): LocalDate {
  const offset = (dayOfWeek(date) - weekStartsOn + 7) % 7;
  return addDays(date, -offset);
}

export function isBetween(date: LocalDate, from: LocalDate, to: LocalDate): boolean {
  return from <= date && date <= to;
}

/** Minutes since 1970-01-01T00:00, read as a local time. */
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
 * Today's date in Seoul. Lambda runs in UTC, so `new Date()` alone gives
 * yesterday's date between 00:00 and 08:59 KST.
 */
export function todayInSeoul(now: Date = new Date()): LocalDate {
  return fromDayNumber(Math.floor((now.getTime() + SEOUL_OFFSET_MS) / MS_PER_DAY));
}
