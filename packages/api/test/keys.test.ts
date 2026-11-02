import { describe, expect, it } from 'vitest';
import { keys, monthsBetween } from '../src/db/keys';

describe('keys', () => {
  it('puts a shift in the partition of its work month', () => {
    expect(keys.shift('2026-11-30', '01HZX')).toEqual({ PK: 'SHIFT#2026-11', SK: '2026-11-30#01HZX' });
  });

  it('keeps every config item in one partition', () => {
    expect(keys.settings().PK).toBe('CONFIG');
    expect(keys.wage('2027-01-01')).toEqual({ PK: 'CONFIG', SK: 'WAGE#2027-01-01' });
    expect(keys.deduction('2026-01-01').SK).toBe('DEDUCT#2026-01-01');
    expect(keys.token('api').SK).toBe('TOKEN#api');
  });
});

describe('monthsBetween', () => {
  it('lists every month the range touches, across a year boundary', () => {
    expect(monthsBetween('2026-11-09', '2027-01-31')).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  it('returns a single month for a range inside one month', () => {
    expect(monthsBetween('2026-11-01', '2026-11-30')).toEqual(['2026-11']);
  });
});
