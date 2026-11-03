import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { APIGatewayProxyResult, LambdaEvent } from '@hono/aws-lambda';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildLambdas, ENTRY_POINTS } from '../scripts/build';
import { functionUrlEvent } from './events';

// 소스가 아니라 실제로 배포할 묶음을 불러서, 빠진 의존성이나 모듈 형식 문제를 배포 전에 잡는다.

let outdir: string;
const require = createRequire(import.meta.url);

beforeAll(async () => {
  outdir = await mkdtemp(join(tmpdir(), 'albapay-bundle-'));
  await buildLambdas(outdir);
}, 30_000);

afterAll(async () => {
  await rm(outdir, { recursive: true, force: true });
});

describe('Lambda bundles', () => {
  it('writes one CommonJS file and a source map per function', async () => {
    for (const name of Object.keys(ENTRY_POINTS)) {
      expect((await readdir(join(outdir, name))).sort()).toEqual(['index.cjs', 'index.cjs.map']);
    }
  });

  it('answers a Function URL event from the bundled API handler', async () => {
    process.env['TABLE_NAME'] = 'unused';
    const { handler } = require(join(outdir, 'api', 'index.cjs')) as {
      handler: (event: LambdaEvent) => Promise<APIGatewayProxyResult>;
    };
    const response = await handler(functionUrlEvent('GET', '/api/config') as unknown as LambdaEvent);
    expect(response.statusCode).toBe(401);
  });

  it('exports a handler from the bundled materializer', () => {
    process.env['TABLE_NAME'] = 'unused';
    const bundle = require(join(outdir, 'materializer', 'index.cjs')) as { handler: unknown };
    expect(typeof bundle.handler).toBe('function');
  });
});
