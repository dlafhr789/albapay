import { makeDate, type LocalDate } from '@albapay/shared';

// 테이블 하나에 모든 아이템을 담는다. 키 설계는 docs/data-model.md에 있다.

export const CONFIG_PK = 'CONFIG';
export const PAYSLIP_PK = 'PAYSLIP';
export const RULE_PK = 'RULE';

export type TokenKind = 'api' | 'cal';

export interface ItemKey {
  PK: string;
  SK: string;
}

export const keys = {
  settings: (): ItemKey => ({ PK: CONFIG_PK, SK: 'SETTINGS' }),
  wage: (effectiveFrom: LocalDate): ItemKey => ({ PK: CONFIG_PK, SK: `WAGE#${effectiveFrom}` }),
  deduction: (effectiveFrom: LocalDate): ItemKey => ({ PK: CONFIG_PK, SK: `DEDUCT#${effectiveFrom}` }),
  token: (kind: TokenKind): ItemKey => ({ PK: CONFIG_PK, SK: `TOKEN#${kind}` }),
  shift: (workDate: LocalDate, id: string): ItemKey => ({
    PK: shiftPartition(workDate.slice(0, 7)),
    SK: `${workDate}#${id}`,
  }),
  payslip: (periodStart: LocalDate): ItemKey => ({ PK: PAYSLIP_PK, SK: periodStart }),
  rule: (id: string): ItemKey => ({ PK: RULE_PK, SK: id }),
};

/** 근무는 월 단위 파티션에 넣는다. 달력, 정산, 캘린더 피드가 모두 월별 Query로 끝난다. */
export function shiftPartition(yearMonth: string): string {
  return `SHIFT#${yearMonth}`;
}

/** `from`이 속한 달부터 `to`가 속한 달까지의 `YYYY-MM` 목록 */
export function monthsBetween(from: LocalDate, to: LocalDate): string[] {
  const months: string[] = [];
  let [year, month] = from.split('-').map(Number) as [number, number];
  const last = to.slice(0, 7);
  for (;;) {
    const current = makeDate(year, month, 1).slice(0, 7);
    if (current > last) break;
    months.push(current);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}
