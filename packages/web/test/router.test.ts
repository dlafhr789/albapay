import { describe, expect, it } from 'vitest';
import { matchPath, withQuery } from '../src/lib/router';

describe('matchPath', () => {
  it('reads named segments', () => {
    expect(matchPath('/day/:date', '/day/2026-11-13')).toEqual({ date: '2026-11-13' });
  });

  it('rejects a different shape', () => {
    expect(matchPath('/day/:date', '/day')).toBeNull();
    expect(matchPath('/rules/new', '/rules/abc')).toBeNull();
  });
});

describe('withQuery', () => {
  it('drops empty values', () => {
    expect(withQuery('/', { month: '2026-11', date: null })).toBe('/?month=2026-11');
    expect(withQuery('/payroll', {})).toBe('/payroll');
  });
});
