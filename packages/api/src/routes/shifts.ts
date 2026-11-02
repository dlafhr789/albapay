import { Hono } from 'hono';
import { z } from 'zod';
import {
  localDateSchema,
  shiftCreateSchema,
  shiftUpdateSchema,
  toShiftTimes,
  yearMonthSchema,
  type ShiftRecord,
} from '@albapay/shared';
import type { AppDeps } from '../deps';
import { notFound, versionConflict } from '../http/errors';
import { parse, readJson } from '../http/validate';
import { assertNotLocked } from '../locks';

const shiftParams = z.object({ workDate: localDateSchema, id: z.string().min(1).max(64) });

/** 규칙에서 생긴 근무는 지우지 않고 이 상태로 남긴다. 실제 시각은 '근무함'에서만 의미가 있어서 비운다. */
function cancelledFromRule(shift: ShiftRecord, updatedAt: string): ShiftRecord {
  return {
    ...shift,
    status: 'CANCELLED',
    actualStart: null,
    actualEnd: null,
    actualBreakMin: null,
    detached: true,
    version: shift.version + 1,
    updatedAt,
  };
}

export function shiftRoutes({ store, now, newId }: AppDeps): Hono {
  const app = new Hono();

  app.get('/shifts', async (c) => {
    const { month } = parse(z.object({ month: yearMonthSchema }), c.req.query());
    return c.json({ shifts: await store.listShiftsByMonth(month) });
  });

  app.post('/shifts', async (c) => {
    const input = parse(shiftCreateSchema, await readJson(c));
    await assertNotLocked(store, [input.workDate]);
    const shift: ShiftRecord = {
      id: newId(),
      workDate: input.workDate,
      ruleId: null,
      kind: input.kind,
      status: input.status,
      ...toShiftTimes(input),
      detached: false,
      memo: input.memo,
      version: 1,
      updatedAt: now().toISOString(),
    };
    await store.createShift(shift);
    return c.json(shift, 201);
  });

  app.put('/shifts/:workDate/:id', async (c) => {
    const params = parse(shiftParams, c.req.param());
    const input = parse(shiftUpdateSchema, await readJson(c));
    const current = await store.getShift(params.workDate, params.id);
    if (!current) throw notFound('근무가 없습니다.');
    if (current.version !== input.version) {
      throw versionConflict('다른 곳에서 먼저 수정된 근무입니다. 다시 불러온 뒤 수정하세요.');
    }
    await assertNotLocked(store, [current.workDate, input.workDate]);

    const updatedAt = now().toISOString();
    const fields = {
      kind: input.kind,
      status: input.status,
      ...toShiftTimes(input),
      memo: input.memo,
    };
    const original = { workDate: current.workDate, id: current.id, expectedVersion: input.version };

    if (input.workDate === current.workDate) {
      const next: ShiftRecord = {
        ...current,
        ...fields,
        // 규칙에서 생긴 근무를 따로 고치면, 이후 규칙을 바꿔도 이 근무는 다시 만들지 않는다.
        detached: current.detached || current.ruleId !== null,
        version: current.version + 1,
        updatedAt,
      };
      await store.replaceShift(next, input.version);
      return c.json(next);
    }

    if (current.ruleId === null) {
      const moved: ShiftRecord = {
        ...current,
        ...fields,
        workDate: input.workDate,
        version: current.version + 1,
        updatedAt,
      };
      await store.moveShift(original, null, moved);
      return c.json(moved);
    }

    // 규칙에서 생긴 근무는 원래 날짜에 빠진 날로 남기고, 새 날짜에는 직접 추가한 근무를 만든다.
    const created: ShiftRecord = {
      id: newId(),
      workDate: input.workDate,
      ruleId: null,
      ...fields,
      detached: false,
      version: 1,
      updatedAt,
    };
    await store.moveShift(original, cancelledFromRule(current, updatedAt), created);
    return c.json(created);
  });

  app.delete('/shifts/:workDate/:id', async (c) => {
    const params = parse(shiftParams, c.req.param());
    const { version } = parse(z.object({ version: z.coerce.number().int().min(1) }), c.req.query());
    const current = await store.getShift(params.workDate, params.id);
    if (!current) throw notFound('근무가 없습니다.');
    await assertNotLocked(store, [current.workDate]);

    if (current.ruleId !== null) {
      const cancelled = cancelledFromRule(current, now().toISOString());
      await store.replaceShift(cancelled, version);
      return c.json(cancelled);
    }
    await store.deleteShift(current.workDate, current.id, version);
    return c.body(null, 204);
  });

  return app;
}
