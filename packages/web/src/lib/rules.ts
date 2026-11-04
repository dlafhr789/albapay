import { clockRangeMinutes, type RecurringRule } from '@albapay/shared';
import { weekdayName } from './format';

/** 월요일부터 일요일 순서. 시안의 요일 표시 순서다. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** "월 수 금" */
export function ruleDaysLabel(rule: Pick<RecurringRule, 'slots'>): string {
  const days = new Set(rule.slots.map((slot) => slot.dayOfWeek));
  return WEEK_ORDER.filter((day) => days.has(day)).map(weekdayName).join(' ');
}

/** 한 주 평균 계약 근무 시간(분). 격주는 2주 합을 2로 나눈다. */
export function weeklyMinutes(rule: Pick<RecurringRule, 'slots' | 'intervalWeeks'>): number {
  const total = rule.slots.reduce((sum, slot) => sum + clockRangeMinutes(slot.start, slot.end) - slot.breakMin, 0);
  return Math.round(total / rule.intervalWeeks);
}
