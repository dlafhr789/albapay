import type { ClockRange } from './clock';
import { addDays, dayOfWeek, startOfWeek, toDayNumber, type DayOfWeek, type LocalDate } from './date';

/** 규칙에서 한 요일의 근무 시각. 규칙 하나에 같은 요일은 한 번만 있다. */
export interface RuleSlot extends ClockRange {
  dayOfWeek: DayOfWeek;
}

/** 반복 근무 규칙. 저장할 때 날짜별 근무로 펼친다. */
export interface RecurringRule {
  id: string;
  slots: RuleSlot[];
  startDate: LocalDate;
  /** 마지막 근무 날짜. null이면 끝이 없다. */
  endDate: LocalDate | null;
  /** 1이면 매주, 2면 격주. 격주는 시작일이 속한 주부터 한 주 걸러 근무한다. */
  intervalWeeks: 1 | 2;
  /** 근무를 만들지 않는 날짜. 이전 규칙에서 따로 고친 근무가 남아 있는 날이다. */
  skipDates: LocalDate[];
}

export interface RuleOccurrence {
  date: LocalDate;
  slot: RuleSlot;
}

/** 규칙에서 생긴 근무의 ID. 규칙과 날짜가 같으면 항상 같아서, 펼치기를 여러 번 해도 중복이 생기지 않는다. */
export function ruleShiftId(ruleId: string, date: LocalDate): string {
  return `r_${ruleId}_${date.replaceAll('-', '')}`;
}

/**
 * 시작일이 속한 주를 0으로 센 주차. 주는 월요일부터 센다.
 * 토·일이 같은 주에 들어가야 "격주 주말" 근무가 주말 단위로 묶이기 때문이다.
 */
function weekIndex(startDate: LocalDate, date: LocalDate): number {
  return (toDayNumber(startOfWeek(date, 1)) - toDayNumber(startOfWeek(startDate, 1))) / 7;
}

/** `from`~`to`(양 끝 포함) 중에서 규칙이 근무를 만드는 날짜와 그날의 시각 */
export function ruleOccurrences(rule: RecurringRule, from: LocalDate, to: LocalDate): RuleOccurrence[] {
  const first = from > rule.startDate ? from : rule.startDate;
  const last = rule.endDate !== null && rule.endDate < to ? rule.endDate : to;
  const skip = new Set(rule.skipDates);
  const occurrences: RuleOccurrence[] = [];
  for (let date = first; date <= last; date = addDays(date, 1)) {
    if (skip.has(date)) continue;
    if (weekIndex(rule.startDate, date) % rule.intervalWeeks !== 0) continue;
    const slot = rule.slots.find((candidate) => candidate.dayOfWeek === dayOfWeek(date));
    if (slot) occurrences.push({ date, slot });
  }
  return occurrences;
}
