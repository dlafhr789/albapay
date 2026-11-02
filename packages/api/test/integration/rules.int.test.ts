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

    expect(await syncAllRules(store, NOW)).toEqual({ rules: 1, created: 0 });
    expect(await syncAllRules(store, NEXT_DAY)).toEqual({ rules: 1, created: 1 });
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
    expect(await syncAllRules(store, NOW)).toEqual({ rules: 1, created: 0 });

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
