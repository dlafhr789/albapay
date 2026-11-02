import { Hono } from 'hono';
import { ruleCreateSchema, type RuleRecord } from '@albapay/shared';
import type { AppDeps } from '../deps';
import { parse, readJson } from '../http/validate';
import { assertRangeNotLocked } from '../locks';
import { syncRule } from '../ruleShifts';

export function ruleRoutes({ store, now, newId }: AppDeps): Hono {
  const app = new Hono();

  app.get('/rules', async (c) => c.json({ rules: await store.listRules() }));

  app.post('/rules', async (c) => {
    const input = parse(ruleCreateSchema, await readJson(c));
    await assertRangeNotLocked(store, input.startDate, input.endDate);
    const timestamp = now();
    const rule: RuleRecord = {
      id: newId(),
      slots: input.slots,
      startDate: input.startDate,
      endDate: input.endDate,
      intervalWeeks: input.intervalWeeks,
      skipDates: [],
      materializedThrough: null,
      version: 1,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    };
    await store.createRule(rule);
    // 저장한 즉시 근무를 펼쳐서 응답을 받은 화면이 바로 달력에 보여 줄 수 있게 한다.
    const { rule: synced } = await syncRule(store, rule, timestamp);
    return c.json(synced, 201);
  });

  return app;
}
