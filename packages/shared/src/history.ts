import type { LocalDate } from './date';
import { PayrollConfigError } from './errors';
import type { WageEntry, Won } from './types';

/** 이력 중에서 `date`에 적용되는 항목: 적용 시작일이 `date` 이하인 것 중 가장 최근 */
export function findEffective<T extends { effectiveFrom: LocalDate }>(
  history: readonly T[],
  date: LocalDate,
): T | undefined {
  let found: T | undefined;
  for (const entry of history) {
    if (entry.effectiveFrom <= date && (!found || entry.effectiveFrom > found.effectiveFrom)) {
      found = entry;
    }
  }
  return found;
}

export function wageOn(wages: readonly WageEntry[], date: LocalDate): Won {
  const entry = findEffective(wages, date);
  if (!entry) {
    throw new PayrollConfigError('NO_WAGE', `${date}에 적용할 시급 이력이 없습니다.`);
  }
  return entry.hourlyWage;
}
