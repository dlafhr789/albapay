import type { APIGatewayProxyResult, LambdaEvent } from '@hono/aws-lambda';
import { describe, expect, it } from 'vitest';
import { functionUrlEvent } from './events';

describe('Lambda handler', () => {
  it('rejects a request without a token before touching the database', async () => {
    process.env['TABLE_NAME'] = 'unused';
    const { handler } = await import('../src/handler');

    const event = functionUrlEvent('GET', '/api/config') as unknown as LambdaEvent;
    const response = (await handler(event)) as APIGatewayProxyResult;

    expect(response.statusCode).toBe(401);
    expect(response.headers?.['cache-control']).toBe('no-store');
    expect(JSON.parse(response.body)).toEqual({
      error: { code: 'UNAUTHORIZED', message: '인증 토큰이 없거나 올바르지 않습니다.' },
    });
  });
});
