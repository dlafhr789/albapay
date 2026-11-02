import { describe, expect, it } from 'vitest';
import { PayrollConfigError } from '../src/errors';
import { periodContaining, periodStartingIn } from '../src/period';

describe('period', () => {
  it('uses the calendar month when the period starts on day 1', () => {
    expect(periodStartingIn('2026-11', 1)).toEqual({ start: '2026-11-01', end: '2026-11-30' });
    expect(periodStartingIn('2027-02', 1)).toEqual({ start: '2027-02-01', end: '2027-02-28' });
  });

  it('runs to the day before the start day of the next month', () => {
    expect(periodStartingIn('2026-12', 25)).toEqual({ start: '2026-12-25', end: '2027-01-24' });
  });

  it('finds the period a date belongs to', () => {
    expect(periodContaining('2026-11-24', 25)).toEqual({ start: '2026-10-25', end: '2026-11-24' });
    expect(periodContaining('2026-11-25', 25)).toEqual({ start: '2026-11-25', end: '2026-12-24' });
    expect(periodContaining('2026-01-10', 25)).toEqual({ start: '2025-12-25', end: '2026-01-24' });
  });

  it('rejects start days that February does not have', () => {
    expect(() => periodStartingIn('2026-11', 29)).toThrow(PayrollConfigError);
    expect(() => periodContaining('2026-11-01', 0)).toThrow(PayrollConfigError);
  });
});
