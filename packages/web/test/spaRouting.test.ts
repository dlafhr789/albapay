// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// infra/app/functions/spa-routing.js는 CloudFront 함수라 모듈이 아니다. 파일 내용을 그대로 평가해서 handler를 꺼낸다.
const source = readFileSync(new URL('../../../infra/app/functions/spa-routing.js', import.meta.url), 'utf8');
const handler = new Function(`${source}; return handler;`)() as (event: { request: { uri: string } }) => { uri: string };

function route(uri: string): string {
  return handler({ request: { uri } }).uri;
}

describe('CloudFront SPA routing function', () => {
  it('serves index.html for app screens', () => {
    expect(route('/')).toBe('/index.html');
    expect(route('/payroll')).toBe('/index.html');
    expect(route('/day/2026-11-13')).toBe('/index.html');
    expect(route('/rules/01JC8Q4K2D9F7T3B5X1W6N8M0P')).toBe('/index.html');
  });

  it('leaves files alone', () => {
    expect(route('/assets/index-Bf5RPeFk.js')).toBe('/assets/index-Bf5RPeFk.js');
    expect(route('/sw.js')).toBe('/sw.js');
    expect(route('/manifest.webmanifest')).toBe('/manifest.webmanifest');
    expect(route('/icons/icon-192.png')).toBe('/icons/icon-192.png');
  });
});
