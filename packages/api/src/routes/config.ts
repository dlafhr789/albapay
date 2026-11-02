import { Hono } from 'hono';
import { z } from 'zod';
import {
  deductionInputSchema,
  localDateSchema,
  settingsSchema,
  wageInputSchema,
  type DeductionProfile,
  type WageEntry,
} from '@albapay/shared';
import type { AppDeps } from '../deps';
import { notFound } from '../http/errors';
import { parse, readJson } from '../http/validate';

const effectiveFromParam = z.object({ effectiveFrom: localDateSchema });

export function configRoutes({ store }: AppDeps): Hono {
  const app = new Hono();

  app.get('/config', async (c) => c.json(await store.loadConfig()));

  app.put('/config/settings', async (c) => {
    const settings = parse(settingsSchema, await readJson(c));
    await store.putSettings(settings);
    return c.json(settings);
  });

  // 시급과 공제는 적용 시작일마다 이력으로 쌓는다. 같은 날짜로 다시 저장하면 그 이력을 고친다.
  app.put('/config/wages/:effectiveFrom', async (c) => {
    const { effectiveFrom } = parse(effectiveFromParam, c.req.param());
    const entry: WageEntry = { effectiveFrom, ...parse(wageInputSchema, await readJson(c)) };
    await store.putWage(entry);
    return c.json(entry);
  });

  app.delete('/config/wages/:effectiveFrom', async (c) => {
    const { effectiveFrom } = parse(effectiveFromParam, c.req.param());
    if (!(await store.deleteWage(effectiveFrom))) throw notFound('해당 날짜의 시급 이력이 없습니다.');
    return c.body(null, 204);
  });

  app.put('/config/deductions/:effectiveFrom', async (c) => {
    const { effectiveFrom } = parse(effectiveFromParam, c.req.param());
    const profile: DeductionProfile = { effectiveFrom, ...parse(deductionInputSchema, await readJson(c)) };
    await store.putDeduction(profile);
    return c.json(profile);
  });

  app.delete('/config/deductions/:effectiveFrom', async (c) => {
    const { effectiveFrom } = parse(effectiveFromParam, c.req.param());
    if (!(await store.deleteDeduction(effectiveFrom))) throw notFound('해당 날짜의 공제 이력이 없습니다.');
    return c.body(null, 204);
  });

  return app;
}
