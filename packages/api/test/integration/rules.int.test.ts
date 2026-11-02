import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import type { PayrollResult, RuleRecord, ShiftRecord } from '@albapay/shared';
import { createApp } from '../../src/app';
import type { Store } from '../../src/db/store';
import { hashToken } from '../../src/http/auth';
import { syncAllRules } from '../../src/ruleShifts';
import { createTestStore } from './helpers';

const TOKEN = 'test-token-0123456789abcdefghijklmnopqrstuvw';
/** 서울 기준 2026-11-02(월) 12:00. 펼치는 범위의 끝은 90일 뒤인 2027-01-31이다. */
const NOW = new Date('2026-11-02T03:00:00.000Z');
const NEXT_DAY = new Date('2026-11-03T03:00:00.000Z');

const WED = 3;
const THU = 4;
const FRI = 5;
const SAT = 6;
const MON = 1;
const SUN = 0;

let store: Store;
let drop: () => Promise<void>;
let app: Hono;
let idSequence = 0;

beforeEach(async () => {
  idSequence = 0;
  ({ store, drop } = await createTestStore());
  await store.putTokenHash('api', hashToken(TOKEN), NOW.toISOString());
  app = createApp({ store, now: () => NOW, newId: () => `ID${String(++idSequence).padStart(4, '0')}` });
});

afterEach(async () => {
  await drop?.();
});

async function call(method: string, path: string, body?: unknown) {
  const response = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-app-token': TOKEN },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function slot(dayOfWeek: number, start = '18:00', end = '23:00', breakMin = 0) {
  return { dayOfWeek, start, end, breakMin };
}

async function createRule(input: Record<string, unknown>): Promise<RuleRecord> {
  const response = await call('POST', '/api/rules', { endDate: null, intervalWeeks: 1, ...input });
  expect(response.status).toBe(201);
  return response.body;
}

async function lockPeriod(periodStart: string, periodEnd: string): Promise<void> {
  await store.createPayslip({
    periodStart,
    periodEnd,
    lockedAt: NOW.toISOString(),
    result: {} as PayrollResult,
  });
}

function editShift(workDate: string, id: string, start: string) {
  return call('PUT', `/api/shifts/${workDate}/${id}`, {
    version: 1,
    workDate,
    kind: 'REGULAR',
    status: 'SCHEDULED',
    planned: { start, end: '23:00', breakMin: 0 },
    actual: null,
    memo: null,
  });
}

async function shiftsOn(workDate: string): Promise<ShiftRecord[]> {
  return store.listShiftsBetween(workDate, workDate);
}

async function shiftsOf(ruleId: string): Promise<ShiftRecord[]> {
  const shifts = await store.listShiftsBetween('2026-09-01', '2027-03-31');
  return shifts.filter((shift) => shift.ruleId === ruleId);
}

describe('POST /api/rules', () => {
  it('expands a new rule into shifts up to 90 days ahead', async () => {
    const rule = await createRule({
      slots: [slot(WED), slot(THU), slot(FRI, '22:00', '06:00', 60)],
      startDate: '2026-11-04',
    });
    expect(rule).toMatchObject({
      id: 'ID0001',
      startDate: '2026-11-04',
      endDate: null,
      intervalWeeks: 1,
      skipDates: [],
      materializedThrough: '2027-01-31',
      version: 1,
    });

    const shifts = await shiftsOf(rule.id);
    expect(shifts).toHaveLength(39);
    expect(shifts.at(-1)?.workDate).toBe('2027-01-29');
    expect(shifts.find((shift) => shift.workDate === '2026-11-06')).toEqual({
      id: 'r_ID0001_20261106',
      workDate: '2026-11-06',
      ruleId: 'ID0001',
      kind: 'REGULAR',
      status: 'SCHEDULED',
      plannedStart: '2026-11-06T22:00',
      plannedEnd: '2026-11-07T06:00',
      plannedBreakMin: 60,
      actualStart: null,
      actualEnd: null,
      actualBreakMin: null,
      detached: false,
      memo: null,
      version: 1,
      updatedAt: NOW.toISOString(),
    });
  });

  it('stops at the end date of the rule', async () => {
    const rule = await createRule({ slots: [slot(SAT)], startDate: '2026-11-07', endDate: '2026-11-28' });
    expect(rule.materializedThrough).toBe('2026-11-28');
    expect((await shiftsOf(rule.id)).map((shift) => shift.workDate)).toEqual([
      '2026-11-07',
      '2026-11-14',
      '2026-11-21',
      '2026-11-28',
    ]);
  });

  it('also fills past dates that are not locked', async () => {
    const rule = await createRule({ slots: [slot(SAT)], startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(await shiftsOf(rule.id)).toHaveLength(5);
  });

  it('leaves a rule that starts after the 90 days for a later run', async () => {
    const rule = await createRule({ slots: [slot(MON)], startDate: '2027-03-01' });
    expect(rule.materializedThrough).toBeNull();
    expect(await shiftsOf(rule.id)).toEqual([]);
  });

  it('rejects a rule that overlaps a locked period', async () => {
    await lockPeriod('2026-10-01', '2026-10-31');

    const overlapping = await call('POST', '/api/rules', {
      slots: [slot(SAT)],
      startDate: '2026-10-15',
      endDate: null,
      intervalWeeks: 1,
    });
    expect(overlapping.status).toBe(409);
    expect(overlapping.body.error.code).toBe('PERIOD_LOCKED');

    await createRule({ slots: [slot(SAT)], startDate: '2026-09-01', endDate: '2026-09-30' });
    await createRule({ slots: [slot(SAT)], startDate: '2026-11-01' });
  });

  it('rejects the same weekday twice', async () => {
    const response = await call('POST', '/api/rules', {
      slots: [slot(SAT), slot(SAT, '09:00', '12:00')],
      startDate: '2026-11-07',
      endDate: null,
      intervalWeeks: 1,
    });
    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([
      { path: 'slots.1.dayOfWeek', message: '같은 요일이 두 번 있습니다. 하루에 근무가 두 번이면 하나는 직접 추가하세요.' },
    ]);
  });
});

describe('GET /api/rules', () => {
  it('lists rules by start date', async () => {
    await createRule({ slots: [slot(SAT)], startDate: '2026-12-05' });
    await createRule({ slots: [slot(WED)], startDate: '2026-11-04' });
    const response = await call('GET', '/api/rules');
    expect(response.status).toBe(200);
    expect(response.body.rules.map((rule: RuleRecord) => rule.startDate)).toEqual(['2026-11-04', '2026-12-05']);
  });
});

describe('syncAllRules', () => {
  it('creates nothing when run twice on the same day and one more day on the next day', async () => {
    const rule = await createRule({ slots: [slot(MON, '09:00', '13:00')], startDate: '2026-11-02' });
    expect(await shiftsOf(rule.id)).toHaveLength(13);

    expect(await syncAllRules(store, NOW)).toEqual({ rules: 1, created: 0, removed: 0 });
    expect(await syncAllRules(store, NEXT_DAY)).toEqual({ rules: 1, created: 1, removed: 0 });
    expect((await store.getRule(rule.id))?.materializedThrough).toBe('2027-02-01');
    expect((await shiftsOf(rule.id)).at(-1)?.workDate).toBe('2027-02-01');
  });

  it('keeps shifts the user changed when a run is repeated', async () => {
    const rule = await createRule({ slots: [slot(WED)], startDate: '2026-11-04', endDate: '2026-11-25' });
    const cancelled = await call('DELETE', `/api/shifts/2026-11-11/r_${rule.id}_20261111?version=1`);
    expect(cancelled.body.status).toBe('CANCELLED');
    const edited = await call('PUT', `/api/shifts/2026-11-18/r_${rule.id}_20261118`, {
      version: 1,
      workDate: '2026-11-18',
      kind: 'REGULAR',
      status: 'SCHEDULED',
      planned: { start: '17:00', end: '23:00', breakMin: 0 },
      actual: null,
      memo: '한 시간 일찍',
    });
    expect(edited.status).toBe(200);

    // 중간에 실패해서 처음부터 다시 펼치는 경우
    await store.setRuleMaterializedThrough(rule.id, null);
    expect(await syncAllRules(store, NOW)).toEqual({ rules: 1, created: 0, removed: 0 });

    const shifts = await shiftsOf(rule.id);
    expect(shifts.map((shift) => [shift.workDate, shift.status, shift.plannedStart])).toEqual([
      ['2026-11-04', 'SCHEDULED', '2026-11-04T18:00'],
      ['2026-11-11', 'CANCELLED', '2026-11-11T18:00'],
      ['2026-11-18', 'SCHEDULED', '2026-11-18T17:00'],
      ['2026-11-25', 'SCHEDULED', '2026-11-25T18:00'],
    ]);
  });

  it('skips dates in a period locked after the rule was saved', async () => {
    const rule: RuleRecord = {
      id: 'LOCKTEST',
      slots: [{ dayOfWeek: SAT, start: '18:00', end: '23:00', breakMin: 0 }],
      startDate: '2026-10-01',
      endDate: '2026-11-30',
      intervalWeeks: 1,
      skipDates: [],
      materializedThrough: null,
      version: 1,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };
    await store.createRule(rule);
    await lockPeriod('2026-10-01', '2026-10-31');

    await syncAllRules(store, NOW);
    const dates = (await shiftsOf(rule.id)).map((shift) => shift.workDate);
    expect(dates).toEqual(['2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28']);
  });
});

describe('POST /api/rules/:id/split', () => {
  it('ends the rule the day before and starts a new one from that date', async () => {
    const rule = await createRule({ slots: [slot(WED), slot(THU), slot(FRI)], startDate: '2026-11-04' });
    const response = await call('POST', `/api/rules/${rule.id}/split`, {
      version: 1,
      fromDate: '2026-11-30',
      slots: [slot(SAT, '12:00', '18:00'), slot(SUN, '12:00', '18:00')],
      endDate: null,
      intervalWeeks: 1,
    });
    expect(response.status).toBe(201);
    const { previous, next } = response.body;
    expect(previous).toMatchObject({ id: rule.id, endDate: '2026-11-29', materializedThrough: '2026-11-29', version: 2 });
    expect(next).toMatchObject({
      startDate: '2026-11-30',
      endDate: null,
      skipDates: [],
      materializedThrough: '2027-01-31',
      version: 1,
    });

    const before = await shiftsOf(rule.id);
    expect(before).toHaveLength(12);
    expect(before.at(-1)?.workDate).toBe('2026-11-27');
    const after = await shiftsOf(next.id);
    expect(after).toHaveLength(18);
    expect(after[0]).toMatchObject({ workDate: '2026-12-05', plannedStart: '2026-12-05T12:00' });
    expect(await store.listRules()).toHaveLength(2);
  });

  it('keeps shifts the user changed and does not add a second shift on those dates', async () => {
    const rule = await createRule({ slots: [slot(WED)], startDate: '2026-11-04' });
    expect((await editShift('2026-12-02', `r_${rule.id}_20261202`, '17:00')).status).toBe(200);
    expect((await call('DELETE', `/api/shifts/2026-12-09/r_${rule.id}_20261209?version=1`)).status).toBe(200);

    const response = await call('POST', `/api/rules/${rule.id}/split`, {
      version: 1,
      fromDate: '2026-11-30',
      slots: [slot(WED, '09:00', '13:00')],
      endDate: null,
      intervalWeeks: 1,
    });
    const { next } = response.body;
    expect(next.skipDates).toEqual(['2026-12-02', '2026-12-09']);

    expect((await shiftsOn('2026-12-02')).map((shift) => [shift.ruleId, shift.plannedStart])).toEqual([
      [rule.id, '2026-12-02T17:00'],
    ]);
    expect((await shiftsOn('2026-12-09')).map((shift) => [shift.ruleId, shift.status])).toEqual([
      [rule.id, 'CANCELLED'],
    ]);
    expect((await shiftsOn('2026-12-16')).map((shift) => [shift.ruleId, shift.plannedStart])).toEqual([
      [next.id, '2026-12-16T09:00'],
    ]);
    expect(await shiftsOf(next.id)).toHaveLength(7);
  });

  it('replaces the whole rule when the change starts on or before its first day', async () => {
    const rule = await createRule({ slots: [slot(WED)], startDate: '2026-11-04' });
    const response = await call('POST', `/api/rules/${rule.id}/split`, {
      version: 1,
      fromDate: '2026-11-04',
      slots: [slot(THU)],
      endDate: null,
      intervalWeeks: 1,
    });
    expect(response.status).toBe(201);
    expect(response.body.previous).toBeNull();
    expect(await store.getRule(rule.id)).toBeNull();
    expect(await shiftsOf(rule.id)).toEqual([]);
    expect(await shiftsOf(response.body.next.id)).toHaveLength(13);
  });

  it('rejects a stale version, a missing rule, and a date after the rule ends', async () => {
    const rule = await createRule({ slots: [slot(SAT)], startDate: '2026-11-07', endDate: '2026-11-28' });
    const body = { version: 1, fromDate: '2026-11-21', slots: [slot(SUN)], endDate: null, intervalWeeks: 1 };

    const stale = await call('POST', `/api/rules/${rule.id}/split`, { ...body, version: 2 });
    expect([stale.status, stale.body.error.code]).toEqual([409, 'VERSION_CONFLICT']);

    const missing = await call('POST', '/api/rules/NOPE/split', body);
    expect([missing.status, missing.body.error.code]).toEqual([404, 'NOT_FOUND']);

    const late = await call('POST', `/api/rules/${rule.id}/split`, { ...body, fromDate: '2026-12-05' });
    expect(late.status).toBe(400);
    expect(late.body.error.details.map((detail: { path: string }) => detail.path)).toEqual(['fromDate']);

    expect(await store.getRule(rule.id)).toMatchObject({ endDate: '2026-11-28', version: 1 });
  });

  it('rejects a change from a date before a locked period', async () => {
    const rule = await createRule({ slots: [slot(SAT)], startDate: '2026-09-05' });
    await lockPeriod('2026-10-01', '2026-10-31');
    const body = { version: 1, slots: [slot(SUN)], endDate: null, intervalWeeks: 1 };

    const locked = await call('POST', `/api/rules/${rule.id}/split`, { ...body, fromDate: '2026-10-15' });
    expect([locked.status, locked.body.error.code]).toEqual([409, 'PERIOD_LOCKED']);
    expect((await call('POST', `/api/rules/${rule.id}/split`, { ...body, fromDate: '2026-11-01' })).status).toBe(201);
    expect((await shiftsOf(rule.id)).filter((shift) => shift.workDate.startsWith('2026-10'))).toHaveLength(5);
  });
});

describe('POST /api/rules/:id/end', () => {
  it('removes the untouched shifts from that date on', async () => {
    const rule = await createRule({ slots: [slot(SAT)], startDate: '2026-11-07' });
    expect((await editShift('2026-12-12', `r_${rule.id}_20261212`, '17:00')).status).toBe(200);

    const response = await call('POST', `/api/rules/${rule.id}/end`, { version: 1, fromDate: '2026-12-01' });
    expect(response.status).toBe(200);
    expect(response.body.rule).toMatchObject({ endDate: '2026-11-30', materializedThrough: '2026-11-30', version: 2 });
    expect((await shiftsOf(rule.id)).map((shift) => shift.workDate)).toEqual([
      '2026-11-07',
      '2026-11-14',
      '2026-11-21',
      '2026-11-28',
      '2026-12-12',
    ]);
  });

  it('deletes the rule when it ends before its first day', async () => {
    const rule = await createRule({ slots: [slot(SAT)], startDate: '2026-12-05' });
    const response = await call('POST', `/api/rules/${rule.id}/end`, { version: 1, fromDate: '2026-12-05' });
    expect(response).toEqual({ status: 200, body: { rule: null } });
    expect((await call('GET', '/api/rules')).body.rules).toEqual([]);
    expect(await shiftsOf(rule.id)).toEqual([]);
  });

  it('is finished by the daily run when it stopped before removing shifts', async () => {
    const rule = await createRule({ slots: [slot(SAT)], startDate: '2026-11-07' });
    // 규칙의 종료일만 저장하고 근무를 지우기 전에 멈춘 상태
    await store.replaceRule({ ...rule, endDate: '2026-11-30', version: 2 }, 1);

    expect(await syncAllRules(store, NOW)).toEqual({ rules: 1, created: 0, removed: 9 });
    expect(await shiftsOf(rule.id)).toHaveLength(4);
    expect((await store.getRule(rule.id))?.materializedThrough).toBe('2026-11-30');
  });
});
