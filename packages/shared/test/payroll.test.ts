import { describe, expect, it } from 'vitest';
import type { DeductionProfile } from '../src/deductions';
import { calculatePayroll, shiftRangeFor } from '../src/payroll';
import { periodStartingIn } from '../src/period';
import { RATES_2026 } from '../src/rates';
import { FRI, MON, WAGE_10320, WED, settings, shift, weekly } from './helpers';

const WITHHOLDING: DeductionProfile = {
  effectiveFrom: '2026-01-01',
  type: 'WITHHOLDING',
  businessIncomeTaxPpm: RATES_2026.businessIncomeTaxPpm,
  localIncomeTaxPpm: RATES_2026.localIncomeTaxPpm,
};

describe('calculatePayroll', () => {
  // 가상의 한 달: 월·수·금 18:00~23:00 계약 근무, 한 번 일찍 출근, 대타 한 번
  const november = periodStartingIn('2026-11', 1);
  const range = shiftRangeFor(november, 1);
  const shifts = weekly(range.from, range.to, [
    [MON, '18:00', '23:00'],
    [WED, '18:00', '23:00'],
    [FRI, '18:00', '23:00'],
  ]).map((s) =>
    s.workDate === '2026-11-13'
      ? { ...s, status: 'WORKED' as const, actualStart: '2026-11-13T17:00', actualEnd: '2026-11-13T23:00' }
      : s,
  );
  shifts.push(shift('2026-11-21', '12:00', '17:00', { kind: 'EXTRA' }));

  const result = calculatePayroll({
    period: november,
    today: '2026-11-18',
    settings: settings({ hireDate: '2026-07-01' }),
    wages: WAGE_10320,
    deductionProfiles: [WITHHOLDING],
    shifts,
  });

  it('needs shifts from three weeks before the first week', () => {
    expect(range).toEqual({ from: '2026-10-05', to: '2026-11-30' });
  });

  it('splits base pay into confirmed and expected', () => {
    expect(result.base).toEqual({
      confirmedMinutes: 2_160,
      confirmedPay: 371_520,
      expectedMinutes: 2_100,
      expectedPay: 361_200,
      totalMinutes: 4_260,
      totalPay: 732_720,
    });
  });

  it('includes five weeks of holiday pay, three of them final', () => {
    expect(result.weeklyHoliday.map((w) => [w.weekEnd, w.amount, w.final])).toEqual([
      ['2026-11-01', 30_960, true],
      ['2026-11-08', 30_960, true],
      ['2026-11-15', 30_960, true],
      ['2026-11-22', 30_960, false],
      ['2026-11-29', 30_960, false],
    ]);
    expect(result.weeklyHolidayTotal).toBe(154_800);
  });

  it('deducts 3.3% from the gross and returns the net', () => {
    expect(result.gross).toBe(887_520);
    expect(result.deductionTotal).toBe(29_280);
    expect(result.net).toBe(858_240);
    expect(result.warnings).toEqual([]);
  });

  it('warns when the wage history has no entry for the year of the period', () => {
    const january = periodStartingIn('2027-01', 1);
    const payroll = calculatePayroll({
      period: january,
      today: '2027-01-15',
      settings: settings(),
      wages: WAGE_10320,
      deductionProfiles: [
        {
          effectiveFrom: '2026-01-01',
          type: 'SOCIAL_INSURANCE',
          nationalPensionPpm: null,
          healthInsurancePpm: RATES_2026.healthInsurancePpm,
          longTermCarePpm: RATES_2026.longTermCarePpm,
          employmentInsurancePpm: RATES_2026.employmentInsurancePpm,
          earnedIncomeTax: 0,
        },
      ],
      shifts: [],
    });
    expect(payroll.warnings).toHaveLength(2);
    expect(payroll.warnings[0]).toContain('2027년 시급 이력이 없어');
    expect(payroll.warnings[1]).toContain('2027년 4대보험 요율 이력이 없어');
  });
});
