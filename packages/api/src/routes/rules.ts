import { Hono } from 'hono';
import { z } from 'zod';
import {
  addDays,
  ruleCreateSchema,
  ruleEndSchema,
  ruleSplitSchema,
  type LocalDate,
  type RuleRecord,
} from '@albapay/shared';
import type { Store } from '../db/store';
import type { AppDeps } from '../deps';
import { ApiError, notFound, versionConflict } from '../http/errors';
import { parse, readJson } from '../http/validate';
import { assertRangeNotLocked } from '../locks';
import { carriedSkipDates, syncRule } from '../ruleShifts';

const ruleParams = z.object({ id: z.string().min(1).max(64) });

async function requireRule(store: Store, id: string, version: number): Promise<RuleRecord> {
  const rule = await store.getRule(id);
  if (!rule) throw notFound('규칙이 없습니다.');
  if (rule.version !== version) {
    throw versionConflict('다른 곳에서 먼저 수정된 규칙입니다. 다시 불러온 뒤 수정하세요.');
  }
  return rule;
}

/** 규칙이 이미 끝난 뒤의 날짜부터 바꾸거나 끝낼 수는 없다. 그 날짜에는 이 규칙의 근무가 없다. */
function assertBeforeRuleEnds(rule: RuleRecord, fromDate: LocalDate): void {
  if (rule.endDate !== null && fromDate > rule.endDate) {
    const message = `규칙이 ${rule.endDate}에 끝납니다. 그 뒤의 일정은 새 규칙으로 만드세요.`;
    throw new ApiError(400, 'VALIDATION', message, [{ path: 'fromDate', message }]);
  }
}

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

  // 규칙은 고쳐 쓰지 않고 날짜 하나에서 나눈다. 그 날짜 전의 근무는 기존 규칙에 그대로 남는다.
  app.post('/rules/:id/split', async (c) => {
    const { id } = parse(ruleParams, c.req.param());
    const input = parse(ruleSplitSchema, await readJson(c));
    const current = await requireRule(store, id, input.version);
    assertBeforeRuleEnds(current, input.fromDate);
    await assertRangeNotLocked(store, input.fromDate, null);

    const timestamp = now();
    const updatedAt = timestamp.toISOString();
    const previous: RuleRecord = {
      ...current,
      endDate: addDays(input.fromDate, -1),
      version: current.version + 1,
      updatedAt,
    };
    const next: RuleRecord = {
      id: newId(),
      slots: input.slots,
      startDate: input.fromDate,
      endDate: input.endDate,
      intervalWeeks: input.intervalWeeks,
      skipDates: await carriedSkipDates(store, current, input.fromDate),
      materializedThrough: null,
      version: 1,
      createdAt: updatedAt,
      updatedAt,
    };
    await store.splitRule(previous, input.version, next);
    // 기존 규칙의 근무를 먼저 정리해야 같은 날짜에 두 규칙의 근무가 잠깐이라도 함께 보이지 않는다.
    const before = await syncRule(store, previous, timestamp);
    const after = await syncRule(store, next, timestamp);
    return c.json({ previous: before.rule, next: after.rule }, 201);
  });

  app.post('/rules/:id/end', async (c) => {
    const { id } = parse(ruleParams, c.req.param());
    const input = parse(ruleEndSchema, await readJson(c));
    const current = await requireRule(store, id, input.version);
    assertBeforeRuleEnds(current, input.fromDate);
    await assertRangeNotLocked(store, input.fromDate, null);

    const timestamp = now();
    const ended: RuleRecord = {
      ...current,
      endDate: addDays(input.fromDate, -1),
      version: current.version + 1,
      updatedAt: timestamp.toISOString(),
    };
    await store.replaceRule(ended, input.version);
    const { rule } = await syncRule(store, ended, timestamp);
    return c.json({ rule });
  });

  return app;
}
