import type { Context } from 'hono';
import type { z } from 'zod';
import { ApiError } from './errors';

/** 스키마로 검사하고, 실패하면 어느 필드가 왜 틀렸는지 담아 400을 던진다. */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(
      400,
      'VALIDATION',
      '요청 값이 올바르지 않습니다.',
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return result.data;
}

export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ApiError(400, 'VALIDATION', '요청 본문이 올바른 JSON이 아닙니다.');
  }
}
