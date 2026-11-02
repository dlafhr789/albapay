import { describe, expect, it } from 'vitest';
import { calculateDeductions, type DeductionProfile } from '../src/deductions';
import { RATES_2026 } from '../src/rates';

const WITHHOLDING: DeductionProfile = {
  effectiveFrom: '2026-01-01',
  type: 'WITHHOLDING',
  businessIncomeTaxPpm: RATES_2026.businessIncomeTaxPpm,
  localIncomeTaxPpm: RATES_2026.localIncomeTaxPpm,
};

const FULL_SOCIAL_INSURANCE: DeductionProfile = {
  effectiveFrom: '2026-01-01',
  type: 'SOCIAL_INSURANCE',
  nationalPensionPpm: RATES_2026.nationalPensionPpm,
  healthInsurancePpm: RATES_2026.healthInsurancePpm,
  longTermCarePpm: RATES_2026.longTermCarePpm,
  employmentInsurancePpm: RATES_2026.employmentInsurancePpm,
  earnedIncomeTax: 0,
};

const total = (lines: { amount: number }[]) => lines.reduce((sum, line) => sum + line.amount, 0);

describe('calculateDeductions', () => {
  it('case 9: 3.3% withholding cuts each tax below 10 won', () => {
    const lines = calculateDeductions(185_760, WITHHOLDING);
    expect(lines).toEqual([
      { item: 'BUSINESS_INCOME_TAX', amount: 5_570 },
      { item: 'LOCAL_INCOME_TAX', amount: 550 },
    ]);
    expect(185_760 - total(lines)).toBe(179_640);
  });

  it('case 10: social insurance charges long-term care on the health premium', () => {
    const lines = calculateDeductions(800_000, FULL_SOCIAL_INSURANCE);
    expect(lines).toEqual([
      { item: 'NATIONAL_PENSION', amount: 38_000 },
      { item: 'HEALTH_INSURANCE', amount: 28_760 },
      { item: 'LONG_TERM_CARE', amount: 3_770 },
      { item: 'EMPLOYMENT_INSURANCE', amount: 7_200 },
    ]);
    expect(total(lines)).toBe(77_730);
  });

  it('skips items that are turned off', () => {
    const lines = calculateDeductions(800_000, {
      ...FULL_SOCIAL_INSURANCE,
      nationalPensionPpm: null,
      longTermCarePpm: null,
    });
    expect(lines.map((line) => line.item)).toEqual(['HEALTH_INSURANCE', 'EMPLOYMENT_INSURANCE']);
  });

  it('adds local income tax on a manually entered earned income tax', () => {
    const lines = calculateDeductions(2_500_000, { ...FULL_SOCIAL_INSURANCE, earnedIncomeTax: 32_315 });
    expect(lines.slice(-2)).toEqual([
      { item: 'EARNED_INCOME_TAX', amount: 32_315 },
      { item: 'LOCAL_INCOME_TAX', amount: 3_230 },
    ]);
  });

  it('deducts nothing without a profile', () => {
    expect(calculateDeductions(800_000, undefined)).toEqual([]);
    expect(calculateDeductions(800_000, { effectiveFrom: '2026-01-01', type: 'NONE' })).toEqual([]);
  });
});
