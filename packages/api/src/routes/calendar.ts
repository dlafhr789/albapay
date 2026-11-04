import { Hono } from 'hono';
import {
  addDays,
  todayInSeoul,
  type ApiErrorBody,
  type CalendarStatusResponse,
  type CalendarTokenResponse,
} from '@albapay/shared';
import type { AppDeps } from '../deps';
import { generateToken, hashToken, tokenMatches } from '../http/auth';
import { buildCalendarFeed } from '../ics';

/**
 * 피드는 입사일부터 오늘의 120일 뒤까지 담는다.
 * 구독 캘린더는 피드에 없는 일정을 지우므로, 지난 근무를 빼면 캘린더에서도 사라진다. 그래서 과거는 자르지 않는다.
 * 앞쪽은 반복 규칙이 미리 채우는 90일보다 넉넉하게 잡는다.
 */
export const FEED_DAYS_AFTER = 120;

/** 구독 주소의 파일 이름. 토큰은 base64url 43자지만, 형식만 확인하고 길이는 넉넉히 받는다. */
const FEED_FILE = /^([A-Za-z0-9_-]{20,128})\.ics$/;

/**
 * `/api/calendar`: 구독 주소를 만들고 끊는다. 앱 토큰 미들웨어 뒤에 붙는다.
 * 원본 토큰은 만들 때 응답으로 한 번만 돌려주고, 서버에는 해시만 남긴다.
 */
export function calendarRoutes({ store, now }: AppDeps): Hono {
  const app = new Hono();

  app.get('/calendar', async (c) => {
    const info = await store.getTokenInfo('cal');
    return c.json<CalendarStatusResponse>({ enabled: info !== null, createdAt: info?.createdAt ?? null });
  });

  // 다시 만들면 이전 주소는 그 순간부터 404가 된다. 주소가 새어 나갔을 때 끊는 방법이기도 하다.
  app.post('/calendar/token', async (c) => {
    const token = generateToken();
    const createdAt = now().toISOString();
    await store.putTokenHash('cal', hashToken(token), createdAt);
    return c.json<CalendarTokenResponse>({ token, createdAt }, 201);
  });

  app.delete('/calendar/token', async (c) => {
    await store.deleteToken('cal');
    return c.body(null, 204);
  });

  return app;
}

/**
 * `/cal/<토큰>.ics`: 캘린더 앱이 받아 가는 피드.
 * 캘린더 앱은 요청에 헤더를 붙일 수 없어서 토큰이 주소에 들어간다(ADR 0004).
 * 토큰이 없거나 틀리면, 주소가 맞는지 짐작할 수 없게 형식이 틀린 경우와 똑같이 404다.
 */
export function calendarFeedRoutes({ store, now }: AppDeps): Hono {
  const app = new Hono();

  app.get('/:file', async (c) => {
    // 캘린더 앱과 중간 캐시가 개인 일정을 보관하지 않게 한다. 다시 받는 주기는 캘린더 앱이 정한다.
    c.header('Cache-Control', 'no-store');
    const notFound = () =>
      c.json<ApiErrorBody>({ error: { code: 'NOT_FOUND', message: '없는 경로입니다.' } }, 404);

    const token = FEED_FILE.exec(c.req.param('file'))?.[1];
    if (!token) return notFound();
    const storedHash = await store.getTokenHash('cal');
    if (!storedHash || !tokenMatches(token, storedHash)) return notFound();

    const config = await store.loadConfig();
    // 설정이 없으면 입사일을 모른다. 구독 주소는 설정을 저장한 뒤에만 만들 수 있어서 실제로는 거의 없는 경우다.
    const shifts = config.settings
      ? await store.listShiftsBetween(config.settings.hireDate, addDays(todayInSeoul(now()), FEED_DAYS_AFTER))
      : [];
    const body = buildCalendarFeed(shifts, {
      title: config.settings?.eventTitle ?? '알바',
      showPay: config.settings?.showPayInEvent ?? false,
      wages: config.wages,
    });
    return c.body(body, 200, { 'Content-Type': 'text/calendar; charset=utf-8' });
  });

  return app;
}
