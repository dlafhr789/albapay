import { calculateBasePay, type BasePay } from './basePay';
import { addDays, startOfWeek, type DayOfWeek, type LocalDate } from './date';
import {
  calculateDeductions,
  type DeductionLine,
  type DeductionProfile,
} from './deductions';
import { findEffective } from './history';
import type { PayrollSettings, Period, Shift, WageEntry, Won } from './types';
import { calculateWeeklyHoliday, type WeeklyHolidayWeek } from './weeklyHoliday';

export interface PayrollInput {
  period: Period;
  /** 서울 기준 오늘. `todayInSeoul()`로 구한다. */
  today: LocalDate;
  settings: PayrollSettings;
  wages: readonly WageEntry[];
  deductionProfiles: readonly DeductionProfile[];
  /** `shiftRangeFor()`가 돌려주는 범위의 근무 */
  shifts: readonly Shift[];
}

export interface PayrollResult {
  period: Period;
  base: BasePay;
  weeklyHoliday: WeeklyHolidayWeek[];
  weeklyHolidayTotal: Won;
  gross: Won;
  deductions: DeductionLine[];
  deductionTotal: Won;
  net: Won;
  /** 계산은 됐지만 값이 틀렸을 수 있는 상황 */
  warnings: string[];
}

/**
 * 정산 계산에 필요한 근무 범위. 기간 첫 주의 4주 평균을 내려면
 * 그 주가 시작하기 전 3주의 근무도 있어야 한다.
 */
export function shiftRangeFor(
  period: Period,
  weekStartsOn: DayOfWeek,
): { from: LocalDate; to: LocalDate } {
  return { from: addDays(startOfWeek(period.start, weekStartsOn), -21), to: period.end };
}

function collectWarnings(input: PayrollInput): string[] {
  const warnings: string[] = [];
  const year = input.period.end.slice(0, 4);
  const yearStart = `${year}-01-01`;

  const wage = findEffective(input.wages, input.period.end);
  if (wage && wage.effectiveFrom < yearStart) {
    warnings.push(
      `${year}년 시급 이력이 없어 ${wage.effectiveFrom}부터 적용된 시급으로 계산했습니다.`,
    );
  }

  const profile = findEffective(input.deductionProfiles, input.period.end);
  if (profile?.type === 'SOCIAL_INSURANCE' && profile.effectiveFrom < yearStart) {
    warnings.push(
      `${year}년 4대보험 요율 이력이 없어 ${profile.effectiveFrom}부터 적용된 요율로 계산했습니다.`,
    );
  }
  return warnings;
}

export function calculatePayroll(input: PayrollInput): PayrollResult {
  const base = calculateBasePay(input.shifts, input.wages, input.period, input.today);
  const weeklyHoliday = calculateWeeklyHoliday(input);
  const weeklyHolidayTotal = weeklyHoliday.reduce((sum, week) => sum + week.amount, 0);
  const gross = base.totalPay + weeklyHolidayTotal;
  // 정산 기간 마지막 날에 적용되는 공제 방식을 기간 전체에 쓴다.
  const deductions = calculateDeductions(
    gross,
    findEffective(input.deductionProfiles, input.period.end),
  );
  const deductionTotal = deductions.reduce((sum, line) => sum + line.amount, 0);

  return {
    period: input.period,
    base,
    weeklyHoliday,
    weeklyHolidayTotal,
    gross,
    deductions,
    deductionTotal,
    net: gross - deductionTotal,
    warnings: collectWarnings(input),
  };
}
