import type { APIGatewayProxyResult, LambdaEvent } from '@hono/aws-lambda';
import { describe, expect, it } from 'vitest';

/** Lambda Function URL이 보내는 이벤트(페이로드 2.0) */
function functionUrlEvent(method: string, path: string, headers: Record<string, string> = {}) {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    headers: { host: 'example.lambda-url.ap-northeast-2.on.aws', ...headers },
    requestContext: {
      accountId: 'anonymous',
      apiId: 'example',
      domainName: 'example.lambda-url.ap-northeast-2.on.aws',
      domainPrefix: 'example',
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'vitest' },
      requestId: 'request-1',
      routeKey: '$default',
      stage: '$default',
      time: '02/Nov/2026:08:00:00 +0000',
      timeEpoch: 1_793_520_000_000,
    },
    body: null,
    isBase64Encoded: false,
  };
}

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
