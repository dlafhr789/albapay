import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayOfWeek,
  minutesBetween,
  startOfWeek,
  todayInSeoul,
  toDayNumber,
} from '../src/date';

describe('date', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('returns the day of week with Sunday as 0', () => {
    expect(dayOfWeek('2026-11-01')).toBe(0);
    expect(dayOfWeek('2026-11-02')).toBe(1);
    expect(dayOfWeek('2026-10-31')).toBe(6);
  });

  it('finds the start of the week for a given first weekday', () => {
    expect(startOfWeek('2026-11-01', 1)).toBe('2026-10-26');
    expect(startOfWeek('2026-11-02', 1)).toBe('2026-11-02');
    expect(startOfWeek('2026-11-04', 0)).toBe('2026-11-01');
  });

  it('counts minutes of an overnight shift', () => {
    expect(minutesBetween('2026-11-08T22:00', '2026-11-09T02:00')).toBe(240);
  });

  it('rejects dates that do not exist', () => {
    expect(() => toDayNumber('2026-02-30')).toThrow(RangeError);
    expect(() => minutesBetween('2026-11-01T24:00', '2026-11-02T01:00')).toThrow(RangeError);
  });

  it('uses the Seoul date even when UTC is still on the previous day', () => {
    // 서울 시각 2026-11-01 08:30
    expect(todayInSeoul(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11-01');
    // 서울 시각 2026-11-01 23:59
    expect(todayInSeoul(new Date('2026-11-01T14:59:00Z'))).toBe('2026-11-01');
  });
});
