import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import type { ShiftRecord } from '@albapay/shared';
import { createApp } from '../../src/app';
import type { Store } from '../../src/db/store';
import { hashToken } from '../../src/http/auth';
import { createTestStore, shiftRecord } from './helpers';

const TOKEN = 'test-token-0123456789abcdefghijklmnopqrstuvw';
const NOW = new Date('2026-11-18T03:00:00.000Z');

let store: Store;
let drop: () => Promise<void>;
let app: Hono;
let idSequence = 0;

beforeAll(async () => {
  ({ store, drop } = await createTestStore());
  await store.putTokenHash('api', hashToken(TOKEN), NOW.toISOString());
  app = createApp({ store, now: () => NOW, newId: () => `id${++idSequence}` });
});

afterAll(async () => {
  await drop?.();
});

async function call(method: string, path: string, body?: unknown, token: string | null = TOKEN) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== null) headers['x-app-token'] = token;
  const response = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const settings = {
  hireDate: '2026-07-01',
  periodStartDay: 1,
  payDay: 10,
  weekStartsOn: 1,
  weeklyHolidayMode: 'FOUR_WEEK_AVERAGE',
  eventTitle: '알바',
  showPayInEvent: true,
};

describe('authentication', () => {
  it('rejects a missing or wrong token', async () => {
    expect((await call('GET', '/api/config', undefined, null)).status).toBe(401);
    expect((await call('GET', '/api/config', undefined, 'wrong')).body.error.code).toBe('UNAUTHORIZED');
  });

  it('checks the token before revealing whether a path exists', async () => {
    expect((await call('GET', '/api/nothing-here', undefined, null)).status).toBe(401);
    expect(await call('GET', '/api/nothing-here')).toEqual({
      status: 404,
      body: { error: { code: 'NOT_FOUND', message: '없는 경로입니다.' } },
    });
  });
});

describe('config', () => {
  it('starts empty', async () => {
    expect((await call('GET', '/api/config')).body).toEqual({ settings: null, wages: [], deductions: [] });
  });

  it('saves settings and reports which fields are invalid', async () => {
    expect(await call('PUT', '/api/config/settings', settings)).toEqual({ status: 200, body: settings });

    const invalid = await call('PUT', '/api/config/settings', { ...settings, periodStartDay: 31, eventTitle: '' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION');
    expect(invalid.body.error.details.map((d: { path: string }) => d.path)).toEqual(['periodStartDay', 'eventTitle']);
  });

  it('rejects a body that is not JSON', async () => {
    const response = await call('PUT', '/api/config/settings', '{not json');
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('요청 본문이 올바른 JSON이 아닙니다.');
  });

  it('keeps wages as a history keyed by effective date', async () => {
    await call('PUT', '/api/config/wages/2027-01-01', { hourlyWage: 10_700 });
    await call('PUT', '/api/config/wages/2026-01-01', { hourlyWage: 10_000 });
    // 같은 날짜로 다시 저장하면 그 이력을 고친다.
    await call('PUT', '/api/config/wages/2026-01-01', { hourlyWage: 10_320 });

    expect((await call('GET', '/api/config')).body.wages).toEqual([
      { effectiveFrom: '2026-01-01', hourlyWage: 10_320 },
      { effectiveFrom: '2027-01-01', hourlyWage: 10_700 },
    ]);
    expect((await call('DELETE', '/api/config/wages/2027-01-01')).status).toBe(204);
    expect((await call('DELETE', '/api/config/wages/2027-01-01')).status).toBe(404);
    expect((await call('PUT', '/api/config/wages/2027-02-30', { hourlyWage: 1 })).body.error.details[0].path).toBe(
      'effectiveFrom',
    );
  });

  it('stores deduction profiles of each type', async () => {
    const profile = {
      type: 'SOCIAL_INSURANCE',
      nationalPensionPpm: null,
      healthInsurancePpm: 35_950,
      longTermCarePpm: 131_400,
      employmentInsurancePpm: 9_000,
      earnedIncomeTax: 0,
    };
    expect((await call('PUT', '/api/config/deductions/2026-01-01', profile)).body).toEqual({
      effectiveFrom: '2026-01-01',
      ...profile,
    });
    expect((await call('PUT', '/api/config/deductions/2026-01-01', { type: 'UNKNOWN' })).status).toBe(400);
  });
});

describe('shifts', () => {
  const planned = { start: '18:00', end: '23:00', breakMin: 0 };

  function updateBody(shift: ShiftRecord, changes: Record<string, unknown> = {}) {
    return {
      version: shift.version,
      workDate: shift.workDate,
      kind: shift.kind,
      status: shift.status,
      planned,
      actual: null,
      memo: shift.memo,
      ...changes,
    };
  }

  it('adds a shift as an extra shift by default and stores overnight times', async () => {
    const response = await call('POST', '/api/shifts', {
      workDate: '2026-11-21',
      planned: { start: '22:00', end: '02:00', breakMin: 0 },
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      workDate: '2026-11-21',
      kind: 'EXTRA',
      status: 'SCHEDULED',
      plannedStart: '2026-11-21T22:00',
      plannedEnd: '2026-11-22T02:00',
      ruleId: null,
      version: 1,
      updatedAt: NOW.toISOString(),
    });
    expect((await call('GET', '/api/shifts?month=2026-11')).body.shifts.map((s: ShiftRecord) => s.id)).toContain(
      response.body.id,
    );
  });

  it('reports every invalid field of a new shift', async () => {
    const response = await call('POST', '/api/shifts', {
      workDate: '2026-11-21',
      status: 'WORKED',
      planned: { start: '09:00', end: '09:00', breakMin: 0 },
    });
    expect(response.body.error.details.map((d: { path: string }) => d.path)).toEqual(['planned.end', 'actual']);
  });

  it('needs a valid month to list shifts', async () => {
    expect((await call('GET', '/api/shifts?month=2026-13')).status).toBe(400);
    expect((await call('GET', '/api/shifts')).status).toBe(400);
  });

  it('updates a shift with actual times and bumps its version', async () => {
    const created = (await call('POST', '/api/shifts', { workDate: '2026-11-13', kind: 'REGULAR', planned })).body;
    const response = await call(
      'PUT',
      `/api/shifts/2026-11-13/${created.id}`,
      updateBody(created, { status: 'WORKED', actual: { start: '17:00', end: '23:00', breakMin: 0 }, memo: '일찍 출근' }),
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'WORKED',
      actualStart: '2026-11-13T17:00',
      actualEnd: '2026-11-13T23:00',
      memo: '일찍 출근',
      version: 2,
    });
  });

  it('rejects an update made from a stale copy', async () => {
    const created = (await call('POST', '/api/shifts', { workDate: '2026-11-14', planned })).body;
    await call('PUT', `/api/shifts/2026-11-14/${created.id}`, updateBody(created, { memo: '먼저 수정' }));

    const stale = await call('PUT', `/api/shifts/2026-11-14/${created.id}`, updateBody(created, { memo: '늦은 수정' }));
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('returns 404 for a shift that does not exist', async () => {
    const ghost = shiftRecord('2026-11-15', { id: 'ghost' });
    expect((await call('PUT', '/api/shifts/2026-11-15/ghost', updateBody(ghost))).status).toBe(404);
    expect((await call('DELETE', '/api/shifts/2026-11-15/ghost?version=1')).status).toBe(404);
  });

  it('moves a manually added shift to another month under the same id', async () => {
    const created = (await call('POST', '/api/shifts', { workDate: '2026-11-30', planned })).body;
    const moved = await call(
      'PUT',
      `/api/shifts/2026-11-30/${created.id}`,
      updateBody(created, { workDate: '2026-12-01' }),
    );
    expect(moved.body).toMatchObject({ id: created.id, workDate: '2026-12-01', plannedStart: '2026-12-01T18:00', version: 2 });
    expect(await store.getShift('2026-11-30', created.id)).toBeNull();
  });

  it('marks a rule-generated shift as detached when it is edited', async () => {
    const fromRule = shiftRecord('2026-11-16', { id: 'r_rule1_20261116', ruleId: 'rule1' });
    await store.createShift(fromRule);
    const response = await call('PUT', `/api/shifts/2026-11-16/${fromRule.id}`, updateBody(fromRule, { memo: '이 날만' }));
    expect(response.body).toMatchObject({ ruleId: 'rule1', detached: true, memo: '이 날만', version: 2 });
  });

  it('leaves a rule-generated shift as cancelled when it is moved', async () => {
    const fromRule = shiftRecord('2026-11-17', { id: 'r_rule1_20261117', ruleId: 'rule1' });
    await store.createShift(fromRule);
    const response = await call(
      'PUT',
      `/api/shifts/2026-11-17/${fromRule.id}`,
      updateBody(fromRule, { workDate: '2026-11-19' }),
    );
    expect(response.body).toMatchObject({ workDate: '2026-11-19', ruleId: null, detached: false, version: 1 });
    expect(await store.getShift('2026-11-17', fromRule.id)).toMatchObject({
      status: 'CANCELLED',
      detached: true,
      version: 2,
    });
  });

  it('deletes a manually added shift but cancels a rule-generated one', async () => {
    const manual = (await call('POST', '/api/shifts', { workDate: '2026-11-22', planned })).body;
    expect((await call('DELETE', `/api/shifts/2026-11-22/${manual.id}?version=2`)).status).toBe(409);
    expect((await call('DELETE', `/api/shifts/2026-11-22/${manual.id}?version=1`)).status).toBe(204);

    const fromRule = shiftRecord('2026-11-23', { id: 'r_rule1_20261123', ruleId: 'rule1' });
    await store.createShift(fromRule);
    const cancelled = await call('DELETE', `/api/shifts/2026-11-23/${fromRule.id}?version=1`);
    expect(cancelled).toMatchObject({ status: 200, body: { status: 'CANCELLED', detached: true, version: 2 } });
  });
});

