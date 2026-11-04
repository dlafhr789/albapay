import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Hono } from 'hono';
import { createApp } from '../../src/app';
import type { Store } from '../../src/db/store';
import { hashToken } from '../../src/http/auth';
import { createTestStore, shiftRecord } from './helpers';

const API_TOKEN = 'test-token-calendar-0123';
// 2026-11-18 12:00 서울
const NOW = new Date('2026-11-18T03:00:00.000Z');

let store: Store;
let drop: () => Promise<void>;
let app: Hono;

beforeAll(async () => {
  ({ store, drop } = await createTestStore());
  await store.putTokenHash('api', hashToken(API_TOKEN), NOW.toISOString());
  await store.putSettings({
    hireDate: '2026-07-01',
    periodStartDay: 1,
    payDay: 10,
    weekStartsOn: 1,
    weeklyHolidayMode: 'FOUR_WEEK_AVERAGE',
    eventTitle: '카페',
    showPayInEvent: true,
  });
  await store.putWage({ effectiveFrom: '2026-01-01', hourlyWage: 10_000 });
  for (const shift of [
    shiftRecord('2026-06-30', { id: 'before-hire' }),
    shiftRecord('2026-07-01', { id: 'oldest-kept' }),
    shiftRecord('2026-11-20', { id: 'upcoming' }),
    shiftRecord('2026-11-21', { id: 'cancelled', status: 'CANCELLED' }),
    shiftRecord('2027-03-18', { id: 'latest-kept' }),
    shiftRecord('2027-03-19', { id: 'too-far' }),
  ]) {
    await store.createShift(shift);
  }
  app = createApp({ store, now: () => NOW });
});

afterAll(async () => {
  await drop?.();
});

async function api(method: string, path: string) {
  const response = await app.request(path, {
    method,
    headers: { 'x-app-token': API_TOKEN, 'content-type': 'application/json' },
    ...(method === 'POST' ? { body: '{}' } : {}),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function feed(token: string, method = 'GET') {
  return app.request(`/cal/${token}.ics`, { method });
}

describe('calendar subscription', () => {
  let token: string;

  it('starts disabled', async () => {
    expect(await api('GET', '/api/calendar')).toEqual({ status: 200, body: { enabled: false, createdAt: null } });
  });

  it('needs the app token to manage the subscription', async () => {
    const response = await app.request('/api/calendar/token', { method: 'POST', body: '{}' });
    expect(response.status).toBe(401);
  });

  it('issues a token once and keeps only its hash', async () => {
    const issued = await api('POST', '/api/calendar/token');
    expect(issued.status).toBe(201);
    token = issued.body.token;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.body.createdAt).toBe(NOW.toISOString());

    expect(await store.getTokenHash('cal')).toBe(hashToken(token));
    expect(await api('GET', '/api/calendar')).toEqual({
      status: 200,
      body: { enabled: true, createdAt: NOW.toISOString() },
    });
  });

  it('serves every shift from the hire date to 120 days ahead', async () => {
    const response = await feed(token);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');

    const body = await response.text();
    const uids = [...body.matchAll(/^UID:(.+)@albapay\r$/gm)].map((match) => match[1]);
    expect(uids).toEqual(['oldest-kept', 'upcoming', 'latest-kept']);
    expect(body).toContain('X-WR-CALNAME:카페\r\n');
    expect(body).toContain('DESCRIPTION:5시간 · 예상 급여 50\\,000원\r\n');
  });

  it('answers HEAD without a body', async () => {
    const response = await feed(token, 'HEAD');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('does not tell a wrong token from a malformed path', async () => {
    const wrong = await feed('A'.repeat(43));
    const malformed = await app.request('/cal/short.ics');
    const noExtension = await app.request(`/cal/${token}`);
    for (const response of [wrong, malformed, noExtension]) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: { code: 'NOT_FOUND', message: '없는 경로입니다.' } });
    }
  });

  it('does not accept the app token as a feed token', async () => {
    expect((await feed(API_TOKEN)).status).toBe(404);
  });

  it('stops the old address when a new one is issued', async () => {
    const reissued = await api('POST', '/api/calendar/token');
    expect((await feed(token)).status).toBe(404);
    expect((await feed(reissued.body.token)).status).toBe(200);
    token = reissued.body.token;
  });

  it('turns the subscription off', async () => {
    expect((await api('DELETE', '/api/calendar/token')).status).toBe(204);
    expect((await feed(token)).status).toBe(404);
    expect((await api('GET', '/api/calendar')).body.enabled).toBe(false);
  });

  it('keeps the feed token out of error logs', async () => {
    await store.putTokenHash('cal', hashToken('B'.repeat(43)), NOW.toISOString());
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = vi.spyOn(store, 'loadConfig').mockRejectedValueOnce(new Error('boom'));
    const response = await feed('B'.repeat(43));
    expect(response.status).toBe(500);
    expect(JSON.stringify(spy.mock.calls)).not.toContain('B'.repeat(43));
    expect(spy.mock.calls[0]?.[1]).toMatchObject({ path: '/cal/<redacted>' });
    failing.mockRestore();
    spy.mockRestore();
  });
});
