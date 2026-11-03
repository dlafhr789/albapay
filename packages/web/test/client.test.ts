import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, request, UNAUTHORIZED_EVENT } from '../src/api/client';
import { saveToken } from '../src/api/token';

function respond(status: number, body?: unknown) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    body === undefined ? new Response(null, { status }) : new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentHeaders(fetchMock: ReturnType<typeof respond>): Record<string, string> {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
  return init.headers as Record<string, string>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('request', () => {
  it('sends the stored token in X-App-Token, not Authorization', async () => {
    saveToken('secret-token');
    const fetchMock = respond(200, { ok: true });
    await request('GET', '/api/config');
    expect(sentHeaders(fetchMock)).toEqual({ 'x-app-token': 'secret-token' });
  });

  it('adds the SHA-256 of the exact body it sends', async () => {
    saveToken('t');
    const fetchMock = respond(200, {});
    await request('PUT', '/api/config/wages/2026-01-01', { body: { hourlyWage: 10320, memo: '한글' } });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const expected = createHash('sha256').update(String(init.body), 'utf8').digest('hex');
    expect(sentHeaders(fetchMock)['x-amz-content-sha256']).toBe(expected);
    expect(sentHeaders(fetchMock)['content-type']).toBe('application/json');
  });

  it('returns undefined for 204', async () => {
    respond(204);
    await expect(request('DELETE', '/api/shifts/2026-11-04/abc?version=1')).resolves.toBeUndefined();
  });

  it('turns an API error body into ApiRequestError with its details', async () => {
    respond(400, {
      error: { code: 'VALIDATION', message: '요청 값이 올바르지 않습니다.', details: [{ path: 'endDate', message: '종료일이 시작일보다 이릅니다.' }] },
    });
    const error = await request('POST', '/api/rules', { body: {} }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION', details: [{ path: 'endDate' }] });
  });

  it('signals the app to ask for a new token on 401', async () => {
    respond(401, { error: { code: 'UNAUTHORIZED', message: '인증 토큰이 없거나 올바르지 않습니다.' } });
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    await request('GET', '/api/config').catch(() => undefined);
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('does not sign out when checking a token that is not saved yet', async () => {
    respond(401, { error: { code: 'UNAUTHORIZED', message: '인증 토큰이 없거나 올바르지 않습니다.' } });
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    await request('GET', '/api/config', { token: 'typed-in' }).catch(() => undefined);
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
    expect(listener).not.toHaveBeenCalled();
  });

  it('explains a 403 from CloudFront or the Function URL, which has no API error body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<Error>Forbidden</Error>', { status: 403 })));
    await expect(request('GET', '/api/config')).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });
});
