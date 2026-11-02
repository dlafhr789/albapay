import { describe, expect, it } from 'vitest';
import { clockRangeMinutes, toClockTime, toLocalRange, toShiftTimes } from '../src/clock';
import { paidMinutes } from '../src/shift';

describe('clock', () => {
  it('counts minutes within a day', () => {
    expect(clockRangeMinutes('18:00', '23:00')).toBe(300);
  });

  it('treats an end at or before the start as the next day', () => {
    expect(clockRangeMinutes('22:00', '02:00')).toBe(240);
    expect(clockRangeMinutes('09:00', '09:00')).toBe(1_440);
    expect(toLocalRange('2026-11-30', { start: '22:00', end: '02:00', breakMin: 0 })).toEqual({
      start: '2026-11-30T22:00',
      end: '2026-12-01T02:00',
      breakMin: 0,
    });
  });

  it('rejects malformed times', () => {
    expect(() => clockRangeMinutes('24:00', '01:00')).toThrow(RangeError);
    expect(() => toLocalRange('2026-11-02', { start: '9:00', end: '18:00', breakMin: 0 })).toThrow(
      RangeError,
    );
  });

  it('builds shift fields the payroll engine can read', () => {
    const times = toShiftTimes({
      workDate: '2026-11-06',
      planned: { start: '18:00', end: '23:00', breakMin: 0 },
      actual: { start: '17:00', end: '23:30', breakMin: 30 },
    });
    expect(times).toEqual({
      plannedStart: '2026-11-06T18:00',
      plannedEnd: '2026-11-06T23:00',
      plannedBreakMin: 0,
      actualStart: '2026-11-06T17:00',
      actualEnd: '2026-11-06T23:30',
      actualBreakMin: 30,
    });
    const shift = { id: 'a', workDate: '2026-11-06', kind: 'REGULAR', status: 'WORKED', ...times } as const;
    expect(paidMinutes(shift)).toBe(360);
    expect(toClockTime(times.plannedEnd)).toBe('23:00');
  });

  it('leaves actual fields empty when there is no actual range', () => {
    const times = toShiftTimes({
      workDate: '2026-11-06',
      planned: { start: '18:00', end: '23:00', breakMin: 0 },
      actual: null,
    });
    expect(times.actualStart).toBeNull();
    expect(times.actualEnd).toBeNull();
    expect(times.actualBreakMin).toBeNull();
  });
});
