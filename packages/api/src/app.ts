import { Hono } from 'hono';
import { ulid } from 'ulid';
import { PayrollConfigError, type ApiErrorBody } from '@albapay/shared';
import { StoreError } from './db/errors';
import type { AppDeps } from './deps';
import { requireApiToken } from './http/auth';
import { ApiError } from './http/errors';
import { configRoutes } from './routes/config';
import { payrollRoutes } from './routes/payroll';
import { shiftRoutes } from './routes/shifts';

function toApiError(error: unknown): ApiError | null {
  if (error instanceof ApiError) return error;
  if (error instanceof StoreError) {
    return error.code === 'NOT_FOUND'
      ? new ApiError(404, 'NOT_FOUND', error.message)
      : new ApiError(409, 'VERSION_CONFLICT', error.message);
  }
  if (error instanceof PayrollConfigError) {
    return new ApiError(409, 'NOT_CONFIGURED', error.message);
  }
  return null;
}

export function createApp(
  deps: Pick<AppDeps, 'store'> & Partial<Omit<AppDeps, 'store'>>,
): Hono {
  const resolved: AppDeps = {
    store: deps.store,
    now: deps.now ?? (() => new Date()),
    newId: deps.newId ?? (() => ulid()),
  };
  const app = new Hono();

  app.use('/api/*', async (c, next) => {
    // 개인 급여 정보라 브라우저나 중간 캐시에 남지 않게 한다.
    c.header('Cache-Control', 'no-store');
    await next();
  });
  // 경로가 있는지보다 인증을 먼저 확인해서, 토큰 없이는 API 구조를 알 수 없게 한다.
  app.use('/api/*', requireApiToken(resolved.store));

  app.route('/api', configRoutes(resolved));
  app.route('/api', shiftRoutes(resolved));
  app.route('/api', payrollRoutes(resolved));

  app.notFound((c) =>
    c.json<ApiErrorBody>({ error: { code: 'NOT_FOUND', message: '없는 경로입니다.' } }, 404),
  );

  app.onError((error, c) => {
    const apiError = toApiError(error);
    if (apiError) return c.json(apiError.toBody(), apiError.status);
    console.error('Unhandled error', { method: c.req.method, path: c.req.path, error });
    return c.json<ApiErrorBody>({ error: { code: 'INTERNAL', message: '서버 오류가 발생했습니다.' } }, 500);
  });

  return app;
}
