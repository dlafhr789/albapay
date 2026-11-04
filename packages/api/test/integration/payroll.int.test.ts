import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import { addDays, dayOfWeek, type ShiftRecord } from '@albapay/shared';
import { createApp } from '../../src/app';
import type { Store } from '../../src/db/store';
import { hashToken } from '../../src/http/auth';
import { createTestStore, shiftRecord } from './helpers';

const TOKEN = 'payroll-test-token-0123456789abcdefghijklmn';
// 서울 시각 2026-11-18 12:00
const NOW = new Date('2026-11-18T03:00:00.000Z');

let store: Store;
let drop: () => Promise<void>;
let app: Hono;

async function call(method: string, path: string, body?: unknown) {
  const response = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-app-token': TOKEN },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

/** 가상의 근무: 월·수·금 18:00~23:00 계약 근무. 11월 13일은 한 시간 일찍 출근, 21일은 대타 5시간 */
function seedShifts(): ShiftRecord[] {
  const shifts: ShiftRecord[] = [];
  for (let date = '2026-10-05'; date <= '2026-11-30'; date = addDays(date, 1)) {
    if (![1, 3, 5].includes(dayOfWeek(date))) continue;
    shifts.push(
      date === '2026-11-13'
        ? shiftRecord(date, { status: 'WORKED', actualStart: '2026-11-13T17:00', actualEnd: '2026-11-13T23:00', actualBreakMin: 0 })
        : shiftRecord(date),
    );
  }
  shifts.push(
    shiftRecord('2026-11-21', { kind: 'EXTRA', plannedStart: '2026-11-21T12:00', plannedEnd: '2026-11-21T17:00' }),
  );
  return shifts;
}

beforeAll(async () => {
  ({ store, drop } = await createTestStore());
  await store.putTokenHash('api', hashToken(TOKEN), NOW.toISOString());
  app = createApp({ store, now: () => NOW });
});

afterAll(async () => {
  await drop?.();
});

describe('payroll', () => {
  it('needs settings before it can calculate', async () => {
    const response = await call('GET', '/api/payroll?period=2026-11');
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('NOT_CONFIGURED');
  });

  it('calculates a month from stored settings, wages and shifts', async () => {
    await call('PUT', '/api/config/settings', {
      hireDate: '2026-07-01',
      periodStartDay: 1,
      payDay: 10,
      weekStartsOn: 1,
      weeklyHolidayMode: 'FOUR_WEEK_AVERAGE',
      eventTitle: '알바',
      showPayInEvent: false,
      eventTravelMin: 0,
      eventAlertMin: null,
    });
    await call('PUT', '/api/config/wages/2026-01-01', { hourlyWage: 10_320 });
    await call('PUT', '/api/config/deductions/2026-01-01', {
      type: 'WITHHOLDING',
      businessIncomeTaxPpm: 30_000,
      localIncomeTaxPpm: 100_000,
    });
    for (const shift of seedShifts()) await store.createShift(shift);

    const { status, body } = await call('GET', '/api/payroll?period=2026-11');

    // docs/payroll-rules.md의 한 달 통합 예시와 같은 값이다.
    expect(status).toBe(200);
    expect(body).toMatchObject({
      period: { start: '2026-11-01', end: '2026-11-30' },
      base: { confirmedPay: 371_520, expectedPay: 361_200, totalPay: 732_720 },
      weeklyHolidayTotal: 154_800,
      gross: 887_520,
      deductionTotal: 29_280,
      net: 858_240,
      locked: false,
      lockedAt: null,
    });
  });

  it('refuses to lock a period that has not ended', async () => {
    const response = await call('POST', '/api/payroll/2026-11/lock');
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PERIOD_NOT_ENDED');
  });

  it('locks an ended period once and keeps returning the first result', async () => {
    const first = await call('POST', '/api/payroll/2026-10/lock');
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ period: { start: '2026-10-01', end: '2026-10-31' }, locked: true, lockedAt: NOW.toISOString() });

    const again = await call('POST', '/api/payroll/2026-10/lock');
    expect(again).toEqual({ status: 200, body: first.body });
    expect((await call('GET', '/api/payroll?period=2026-10')).body).toEqual(first.body);
  });

  it('keeps a locked result even after the wage history changes', async () => {
    const before = (await call('GET', '/api/payroll?period=2026-10')).body;
    await call('PUT', '/api/config/wages/2026-01-01', { hourlyWage: 20_000 });
    expect((await call('GET', '/api/payroll?period=2026-10')).body).toEqual(before);
    await call('PUT', '/api/config/wages/2026-01-01', { hourlyWage: 10_320 });
  });

  it('blocks adding, editing, moving into and deleting shifts of a locked period', async () => {
    const planned = { start: '18:00', end: '23:00', breakMin: 0 };
    const october = (await store.listShiftsByMonth('2026-10'))[0]!;
    const november = (await store.listShiftsByMonth('2026-11'))[0]!;
    const body = (shift: ShiftRecord, workDate: string) => ({
      version: shift.version,
      workDate,
      kind: shift.kind,
      status: 'SCHEDULED',
      planned,
      actual: null,
      memo: null,
    });

    const attempts = [
      await call('POST', '/api/shifts', { workDate: '2026-10-15', planned }),
      await call('PUT', `/api/shifts/${october.workDate}/${october.id}`, body(october, october.workDate)),
      await call('PUT', `/api/shifts/${november.workDate}/${november.id}`, body(november, '2026-10-30')),
      await call('DELETE', `/api/shifts/${october.workDate}/${october.id}?version=1`),
    ];
    expect(attempts.map((a) => [a.status, a.body.error.code])).toEqual([
      [409, 'PERIOD_LOCKED'],
      [409, 'PERIOD_LOCKED'],
      [409, 'PERIOD_LOCKED'],
      [409, 'PERIOD_LOCKED'],
    ]);
  });

  it('allows edits again after unlocking', async () => {
    expect((await call('DELETE', '/api/payroll/2026-10/lock')).status).toBe(204);
    expect((await call('DELETE', '/api/payroll/2026-10/lock')).status).toBe(404);
    const created = await call('POST', '/api/shifts', {
      workDate: '2026-10-15',
      planned: { start: '12:00', end: '17:00', breakMin: 0 },
    });
    expect(created.status).toBe(201);
    expect((await call('GET', '/api/payroll?period=2026-10')).body.locked).toBe(false);
  });
});
