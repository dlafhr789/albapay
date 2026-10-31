import type { Ppm } from './types';

/**
 * 2026년 근로자 부담 요율. 설정 화면의 기본값으로 쓴다.
 * 실제 계산은 사용자가 저장한 공제 프로필 이력의 값을 쓴다.
 * 국민연금은 2033년까지 매년 0.5%p(근로자 0.25%p)씩 오르므로 매년 이력을 추가해야 한다.
 */
export const RATES_2026 = {
  /** 3.3% 원천징수 중 사업소득세 3% */
  businessIncomeTaxPpm: 30_000,
  /** 사업소득세의 10% */
  localIncomeTaxPpm: 100_000,
  nationalPensionPpm: 47_500,
  healthInsurancePpm: 35_950,
  /** 건강보험료의 13.14% */
  longTermCarePpm: 131_400,
  employmentInsurancePpm: 9_000,
} as const satisfies Record<string, Ppm>;
