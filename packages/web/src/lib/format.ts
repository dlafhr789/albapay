import { dayOfWeek, type LocalDate } from '@albapay/shared';

const numberFormat = new Intl.NumberFormat('ko-KR');
const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;

export function weekdayName(day: number): string {
  return WEEKDAY_NAMES[day] ?? '';
}

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatWon(value: number): string {
  return `${numberFormat.format(value)}원`;
}

/** 600 → "10시간", 390 → "6시간 30분" */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}분`;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

/** 달력 칸에 들어가는 짧은 표기. 300 → "5h", 390 → "6:30" */
export function formatMinutesShort(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}:${String(rest).padStart(2, '0')}`;
}

function parts(date: LocalDate): [number, number, number] {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return [year, month, day];
}

/** "11월 13일" */
export function formatMonthDay(date: LocalDate): string {
  const [, month, day] = parts(date);
  return `${month}월 ${day}일`;
}

/** "11월 13일 금요일" */
export function formatMonthDayWeekday(date: LocalDate): string {
  return `${formatMonthDay(date)} ${weekdayName(dayOfWeek(date))}요일`;
}

/** "2026년 7월 1일" */
export function formatFullDate(date: LocalDate): string {
  const [year, month, day] = parts(date);
  return `${year}년 ${month}월 ${day}일`;
}

/** "2026-11" → "11월" */
export function formatMonth(yearMonth: string): string {
  return `${Number(yearMonth.slice(5, 7))}월`;
}

/** "2026-11" → 한 달 앞뒤 */
export function shiftMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split('-').map(Number) as [number, number];
  const index = year * 12 + (month - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}
