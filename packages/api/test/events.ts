/** Lambda Function URL이 보내는 이벤트(페이로드 2.0) */
export function functionUrlEvent(method: string, path: string, headers: Record<string, string> = {}) {
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
