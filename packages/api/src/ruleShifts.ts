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
  rule: RuleRecord;
  /** 새로 만든 근무 수 */
  created: number;
}

/**
 * 아직 펼치지 않은 날짜부터 `MATERIALIZE_DAYS` 뒤(규칙이 먼저 끝나면 종료일)까지 근무를 만든다.
 *
 * 근무 ID가 규칙과 날짜로 정해지고 이미 있는 근무는 덮어쓰지 않는다. 그래서 중간에 실패해서 다시 돌려도
 * 근무가 겹치지 않고, 사용자가 그사이 고친 근무도 그대로 남는다. 확정한 정산 기간의 날짜는 건너뛴다.
 */
export async function syncRule(store: Store, rule: RuleRecord, now: Date): Promise<SyncResult> {
  const horizon = addDays(todayInSeoul(now), MATERIALIZE_DAYS);
  const from = rule.materializedThrough === null ? rule.startDate : addDays(rule.materializedThrough, 1);
  const to = rule.endDate !== null && rule.endDate < horizon ? rule.endDate : horizon;
  if (from > to) return { rule, created: 0 };

  const payslips = await store.listPayslips();
  const updatedAt = now.toISOString();
  let created = 0;
  for (const { date, slot } of ruleOccurrences(rule, from, to)) {
    if (isLockedDate(payslips, date)) continue;
    try {
      await store.createShift(ruleShiftRecord(rule, date, slot, updatedAt));
      created += 1;
    } catch (error) {
      if (!(error instanceof StoreError && error.code === 'ALREADY_EXISTS')) throw error;
    }
  }
  await store.setRuleMaterializedThrough(rule.id, to);
  return { rule: { ...rule, materializedThrough: to }, created };
}

/**
 * 모든 규칙을 맞춘다. 매일 새벽에 도는 작업이 호출한다.
 * 한 규칙이 실패해도 나머지는 계속하고, 끝난 뒤 실패를 모아 던져서 작업이 실패로 기록되게 한다.
 */
export async function syncAllRules(store: Store, now: Date): Promise<{ rules: number; created: number }> {
  const rules = await store.listRules();
  const failures: unknown[] = [];
  let created = 0;
  for (const rule of rules) {
    try {
      created += (await syncRule(store, rule, now)).created;
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, `규칙 ${rules.length}개 중 ${failures.length}개를 펼치지 못했습니다.`);
  }
  return { rules: rules.length, created };
}
