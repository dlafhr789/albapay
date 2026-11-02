import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import type { Store } from '../db/store';
import { unauthorized } from './errors';

/** 앱 토큰을 받는 헤더. `Authorization`은 CloudFront OAC가 Lambda 서명에 쓰기 때문에 쓸 수 없다. */
export const TOKEN_HEADER = 'x-app-token';

/** 32바이트 난수. base64url로 43자다. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** 서버에는 토큰 원본이 아니라 이 해시만 저장한다. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** 해시끼리 상수 시간으로 비교해서, 응답 시간으로 토큰을 추측할 수 없게 한다. */
export function tokenMatches(token: string, storedHash: string): boolean {
  const given = Buffer.from(hashToken(token), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return given.length === stored.length && timingSafeEqual(given, stored);
}

export function requireApiToken(store: Store): MiddlewareHandler {
  return async (c, next) => {
    const token = c.req.header(TOKEN_HEADER);
    if (!token) throw unauthorized();
    const storedHash = await store.getTokenHash('api');
    if (!storedHash || !tokenMatches(token, storedHash)) throw unauthorized();
    await next();
  };
}
