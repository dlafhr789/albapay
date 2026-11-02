import { describe, expect, it } from 'vitest';
import { calculateBasePay } from '../src/basePay';
import { PayrollConfigError } from '../src/errors';
import { periodContaining } from '../src/period';
import { FRI, MON, WAGE_10320, WED, shift, weekly } from './helpers';

const WEEK = { start: '2026-11-02', end: '2026-11-08' };
const AFTER_WEEK = '2026-11-09';

describe('calculateBasePay', () => {
  it('case 1: pays 15 hours at 10,320 won', () => {
    const shifts = weekly(WEEK.start, WEEK.end, [
      [MON, '18:00', '23:00'],
      [WED, '18:00', '23:00'],
      [FRI, '18:00', '23:00'],
    ]);
    const result = calculateBasePay(shifts, WAGE_10320, WEEK, AFTER_WEEK);
    expect(result.totalMinutes).toBe(900);
    expect(result.totalPay).toBe(154_800);
  });

  it('case 4: pays nothing for an absent day', () => {
    const shifts = [
      shift('2026-11-02', '18:00', '23:00'),
      shift('2026-11-04', '18:00', '23:00', { status: 'ABSENT' }),
      shift('2026-11-06', '18:00', '23:00'),
    ];
    expect(calculateBasePay(shifts, WAGE_10320, WEEK, AFTER_WEEK).totalPay).toBe(103_200);
  });

  it('case 5: pays actual overtime and extra shifts', () => {
    const shifts = [
      shift('2026-11-02', '18:00', '23:00'),
      shift('2026-11-04', '18:00', '23:00'),
      shift('2026-11-06', '18:00', '23:00', {
        status: 'WORKED',
        actualStart: '2026-11-06T18:00',
        actualEnd: '2026-11-07T00:00',
      }),
      shift('2026-11-07', '10:00', '14:00', { kind: 'EXTRA' }),
    ];
    const result = calculateBasePay(shifts, WAGE_10320, WEEK, AFTER_WEEK);
    expect(result.totalMinutes).toBe(1_200);
    expect(result.totalPay).toBe(206_400);
  });

  it('subtracts unpaid breaks', () => {
    const shifts = [shift('2026-11-02', '09:00', '18:00', { plannedBreakMin: 60 })];
    expect(calculateBasePay(shifts, WAGE_10320, WEEK, AFTER_WEEK).totalMinutes).toBe(480);
  });

  it('case 7: counts an overnight shift in the period of its start date', () => {
    const sundayNight = shift('2026-11-08', '22:00', '02:00');
    const sundayPeriod = periodContaining('2026-11-08', 9);
    const mondayPeriod = periodContaining('2026-11-09', 9);

    expect(calculateBasePay([sundayNight], WAGE_10320, sundayPeriod, '2026-12-01').totalMinutes).toBe(240);
    expect(calculateBasePay([sundayNight], WAGE_10320, mondayPeriod, '2026-12-01').totalMinutes).toBe(0);
  });

  it('case 8: uses the wage in effect on each work date', () => {
    const wages = [...WAGE_10320, { effectiveFrom: '2027-01-01', hourlyWage: 10_700 }];
    const shifts = weekly('2026-12-28', '2027-01-03', [
      [MON, '18:00', '23:00'],
      [WED, '18:00', '23:00'],
      [FRI, '18:00', '23:00'],
    ]);
    const december = calculateBasePay(shifts, wages, periodContaining('2026-12-28', 1), '2027-02-01');
    const january = calculateBasePay(shifts, wages, periodContaining('2027-01-01', 1), '2027-02-01');

    expect(december.totalPay).toBe(103_200);
    expect(january.totalPay).toBe(53_500);
  });

  it('splits confirmed and expected pay at today and keeps their sum equal to the total', () => {
    const shifts = [
      shift('2026-11-02', '18:00', '23:00'),
      shift('2026-11-04', '18:00', '23:00'),
      shift('2026-11-07', '12:00', '17:00', { kind: 'EXTRA' }),
    ];
    const result = calculateBasePay(shifts, WAGE_10320, WEEK, '2026-11-04');

    expect(result.confirmedMinutes).toBe(300);
    expect(result.confirmedPay).toBe(51_600);
    expect(result.expectedMinutes).toBe(600);
    expect(result.expectedPay).toBe(103_200);
    expect(result.confirmedPay + result.expectedPay).toBe(result.totalPay);
  });

  it('fails clearly when no wage applies', () => {
    const shifts = [shift('2025-12-31', '18:00', '23:00')];
    const period = { start: '2025-12-01', end: '2025-12-31' };
    expect(() => calculateBasePay(shifts, WAGE_10320, period, '2026-01-01')).toThrow(
      PayrollConfigError,
    );
  });

  it('ignores shifts outside the period', () => {
    const shifts = [shift('2026-11-09', '18:00', '23:00'), shift('2026-11-01', '18:00', '23:00')];
    expect(calculateBasePay(shifts, WAGE_10320, WEEK, AFTER_WEEK).totalMinutes).toBe(0);
  });

  it('rejects a shift that ends before it starts after the break', () => {
    const shifts = [shift('2026-11-02', '18:00', '19:00', { plannedBreakMin: 60 })];
    expect(() => calculateBasePay(shifts, WAGE_10320, WEEK, AFTER_WEEK)).toThrow(
      PayrollConfigError,
    );
  });

  it('counts two shifts on the same day', () => {
    const shifts = [shift('2026-11-07', '09:00', '10:00'), shift('2026-11-07', '11:00', '17:30')];
    const result = calculateBasePay(shifts, WAGE_10320, WEEK, AFTER_WEEK);
    expect(result.totalMinutes).toBe(450);
    expect(result.totalPay).toBe(77_400);
  });
});

