import type { LocalDate } from './date';
import type { Ppm, Won } from './types';

export type DeductionProfile =
  | { effectiveFrom: LocalDate; type: 'NONE' }
  | {
      effectiveFrom: LocalDate;
      /** 3.3% 원천징수: 사업소득세 + 지방소득세 */
      type: 'WITHHOLDING';
      businessIncomeTaxPpm: Ppm;
      /** 사업소득세에 곱하는 비율 */
      localIncomeTaxPpm: Ppm;
    }
  | {
      effectiveFrom: LocalDate;
      /** 4대보험. 내지 않는 항목은 null */
      type: 'SOCIAL_INSURANCE';
      nationalPensionPpm: Ppm | null;
      healthInsurancePpm: Ppm | null;
      /** 건강보험료에 곱하는 비율 */
      longTermCarePpm: Ppm | null;
      employmentInsurancePpm: Ppm | null;
      /** 근로소득세. 간이세액표 금액을 직접 넣는다. 지방소득세는 이 금액의 10%로 계산한다. */
      earnedIncomeTax: Won;
    };

export type DeductionItem =
  | 'BUSINESS_INCOME_TAX'
  | 'LOCAL_INCOME_TAX'
  | 'NATIONAL_PENSION'
  | 'HEALTH_INSURANCE'
  | 'LONG_TERM_CARE'
  | 'EMPLOYMENT_INSURANCE'
  | 'EARNED_INCOME_TAX';

export interface DeductionLine {
  item: DeductionItem;
  amount: Won;
}

/** `base × rate`에서 10원 미만을 버린다. */
function applyRate(base: Won, ppm: Ppm): Won {
  return Math.floor((base * ppm) / 10_000_000) * 10;
}

const LOCAL_INCOME_TAX_ON_EARNED_PPM = 100_000;

/** 세전 금액(기본급 + 주휴수당)에서 빠지는 공제 항목 */
export function calculateDeductions(
  gross: Won,
  profile: DeductionProfile | undefined,
): DeductionLine[] {
  if (!profile || profile.type === 'NONE') return [];

  if (profile.type === 'WITHHOLDING') {
    const business = applyRate(gross, profile.businessIncomeTaxPpm);
    return [
      { item: 'BUSINESS_INCOME_TAX', amount: business },
      { item: 'LOCAL_INCOME_TAX', amount: applyRate(business, profile.localIncomeTaxPpm) },
    ];
  }

  const lines: DeductionLine[] = [];
  if (profile.nationalPensionPpm !== null) {
    lines.push({ item: 'NATIONAL_PENSION', amount: applyRate(gross, profile.nationalPensionPpm) });
  }
  if (profile.healthInsurancePpm !== null) {
    const health = applyRate(gross, profile.healthInsurancePpm);
    lines.push({ item: 'HEALTH_INSURANCE', amount: health });
    // Long-term care is charged on top of the health premium, never on its own.
    if (profile.longTermCarePpm !== null) {
      lines.push({ item: 'LONG_TERM_CARE', amount: applyRate(health, profile.longTermCarePpm) });
    }
  }
  if (profile.employmentInsurancePpm !== null) {
    lines.push({
      item: 'EMPLOYMENT_INSURANCE',
      amount: applyRate(gross, profile.employmentInsurancePpm),
    });
  }
  if (profile.earnedIncomeTax > 0) {
    lines.push({ item: 'EARNED_INCOME_TAX', amount: profile.earnedIncomeTax });
    lines.push({
      item: 'LOCAL_INCOME_TAX',
      amount: applyRate(profile.earnedIncomeTax, LOCAL_INCOME_TAX_ON_EARNED_PPM),
    });
  }
  return lines;
}
