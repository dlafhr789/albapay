import {
  addDays,
  ruleOccurrences,
  ruleShiftId,
  todayInSeoul,
  toShiftTimes,
  type LocalDate,
  type RecurringRule,
  type RuleRecord,
  type RuleSlot,
  type ShiftRecord,
} from '@albapay/shared';
import { StoreError } from './db/errors';
import type { Store } from './db/store';
import { isLockedDate } from './locks';

/**
 * 반복 규칙의 근무를 오늘부터 며칠 뒤까지 미리 만들어 둘지.
 * 달력과 캘린더 구독에서 석 달 앞까지 보이고, 매일 도는 작업이 하루씩 더 채운다.
 */
export const MATERIALIZE_DAYS = 90;

/** 규칙에서 생긴 근무. 규칙은 계약 근무를 나타내므로 종류는 항상 `REGULAR`다. */
export function ruleShiftRecord(
  rule: RecurringRule,
  date: LocalDate,
  slot: RuleSlot,
  updatedAt: string,
): ShiftRecord {
  return {
    id: ruleShiftId(rule.id, date),
    workDate: date,
    ruleId: rule.id,
    kind: 'REGULAR',
    status: 'SCHEDULED',
    ...toShiftTimes({ workDate: date, planned: slot, actual: null }),
    detached: false,
    memo: null,
    version: 1,
    updatedAt,
  };
}

export interface SyncResult {
  /** 맞춘 뒤의 규칙. 종료일이 시작일보다 앞이라 근무가 하나도 없는 규칙이 되면 지우고 null */
  rule: RuleRecord | null;
  /** 새로 만든 근무 수 */
  created: number;
  /** 규칙 범위 밖이 되어 지운 근무 수 */
  removed: number;
}

/**
 * 종료일 다음 날부터 `materializedThrough`까지 이 규칙이 만든 근무를 지운다.
 * 사용자가 따로 고친 근무와 확정한 정산 기간의 근무는 남긴다.
 */
async function removeShiftsAfterEnd(store: Store, rule: RuleRecord, endDate: LocalDate, through: LocalDate) {
  const payslips = await store.listPayslips();
  const shifts = await store.listShiftsBetween(addDays(endDate, 1), through);
  let removed = 0;
  for (const shift of shifts) {
    if (shift.ruleId !== rule.id || shift.detached || isLockedDate(payslips, shift.workDate)) continue;
    if (await store.deleteUntouchedShift(shift.workDate, shift.id)) removed += 1;
  }
  return removed;
}

/**
 * 규칙에 맞게 근무를 맞춘다. 규칙을 저장한 직후와 매일 새벽에 부른다.
 *
 * 1. 종료일이 당겨져서 이미 만든 근무가 범위 밖에 있으면 지운다. 종료일보다 `materializedThrough`가
 *    뒤에 있는 것이 그 표시다. 지우는 도중에 실패해도 표시가 남아서 다음 실행이 이어서 지운다.
 * 2. 종료일이 시작일보다 앞이면 근무가 하나도 없는 규칙이라 규칙도 지운다.
 * 3. 아직 펼치지 않은 날짜부터 `MATERIALIZE_DAYS` 뒤(규칙이 먼저 끝나면 종료일)까지 근무를 만든다.
 *    근무 ID가 규칙과 날짜로 정해지고 이미 있는 근무는 덮어쓰지 않는다. 그래서 중간에 실패해서 다시
 *    돌려도 근무가 겹치지 않고, 사용자가 그사이 고친 근무도 그대로 남는다.
 *
 * 확정한 정산 기간의 날짜에는 근무를 만들지도 지우지도 않는다.
 */
export async function syncRule(store: Store, rule: RuleRecord, now: Date): Promise<SyncResult> {
  let current = rule;
  let removed = 0;

  const { endDate, materializedThrough } = current;
  if (endDate !== null && materializedThrough !== null && materializedThrough > endDate) {
    removed = await removeShiftsAfterEnd(store, current, endDate, materializedThrough);
    await store.setRuleMaterializedThrough(current.id, endDate);
    current = { ...current, materializedThrough: endDate };
  }

  if (current.endDate !== null && current.endDate < current.startDate) {
    await store.deleteRule(current.id);
    return { rule: null, created: 0, removed };
  }

  const horizon = addDays(todayInSeoul(now), MATERIALIZE_DAYS);
  const from = current.materializedThrough === null ? current.startDate : addDays(current.materializedThrough, 1);
  const to = current.endDate !== null && current.endDate < horizon ? current.endDate : horizon;
  if (from > to) return { rule: current, created: 0, removed };

  const payslips = await store.listPayslips();
  const updatedAt = now.toISOString();
  let created = 0;
  for (const { date, slot } of ruleOccurrences(current, from, to)) {
    if (isLockedDate(payslips, date)) continue;
    try {
      await store.createShift(ruleShiftRecord(current, date, slot, updatedAt));
      created += 1;
    } catch (error) {
      if (!(error instanceof StoreError && error.code === 'ALREADY_EXISTS')) throw error;
    }
  }
  await store.setRuleMaterializedThrough(current.id, to);
  return { rule: { ...current, materializedThrough: to }, created, removed };
}

/**
 * 규칙을 날짜 하나에서 나눌 때 새 규칙이 건너뛸 날짜.
 * 기존 규칙에서 따로 고친 근무(빠진 날 포함)가 남아 있는 날에 새 규칙이 근무를 하나 더 만들지 않게 한다.
 */
export async function carriedSkipDates(store: Store, rule: RuleRecord, fromDate: LocalDate): Promise<LocalDate[]> {
  const dates = new Set(rule.skipDates.filter((date) => date >= fromDate));
  if (rule.materializedThrough !== null && rule.materializedThrough >= fromDate) {
    for (const shift of await store.listShiftsBetween(fromDate, rule.materializedThrough)) {
      if (shift.ruleId === rule.id && shift.detached) dates.add(shift.workDate);
    }
  }
  return [...dates].sort();
}

/**
 * 모든 규칙을 맞춘다. 매일 새벽에 도는 작업이 호출한다.
 * 한 규칙이 실패해도 나머지는 계속하고, 끝난 뒤 실패를 모아 던져서 작업이 실패로 기록되게 한다.
 */
export async function syncAllRules(
  store: Store,
  now: Date,
): Promise<{ rules: number; created: number; removed: number }> {
  const rules = await store.listRules();
  const failures: unknown[] = [];
  let created = 0;
  let removed = 0;
  for (const rule of rules) {
    try {
      const result = await syncRule(store, rule, now);
      created += result.created;
      removed += result.removed;
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, `규칙 ${rules.length}개 중 ${failures.length}개를 맞추지 못했습니다.`);
  }
  return { rules: rules.length, created, removed };
}
