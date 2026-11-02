import { describe, expect, it } from 'vitest';
import { ruleOccurrences, ruleShiftId, type RecurringRule, type RuleSlot } from '../src/rules';
import { FRI, SAT, SUN, THU, WED } from './helpers';

function slot(dayOfWeek: RuleSlot['dayOfWeek'], start = '18:00', end = '23:00'): RuleSlot {
  return { dayOfWeek, start, end, breakMin: 0 };
}

function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: '01JRULE',
    slots: [slot(WED), slot(THU), slot(FRI)],
    startDate: '2026-11-01',
    endDate: null,
    intervalWeeks: 1,
    skipDates: [],
    ...overrides,
  };
}

function dates(target: RecurringRule, from: string, to: string): string[] {
  return ruleOccurrences(target, from, to).map((occurrence) => occurrence.date);
}

describe('ruleOccurrences', () => {
  it('expands a weekly rule into each matching weekday', () => {
    expect(dates(rule(), '2026-11-01', '2026-11-14')).toEqual([
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
    ]);
  });

  it('pairs each date with the slot for its weekday', () => {
    const target = rule({ slots: [slot(WED, '09:00', '13:00'), slot(FRI, '18:00', '02:00')] });
    expect(ruleOccurrences(target, '2026-11-04', '2026-11-06')).toEqual([
      { date: '2026-11-04', slot: slot(WED, '09:00', '13:00') },
      { date: '2026-11-06', slot: slot(FRI, '18:00', '02:00') },
    ]);
  });

  it('stays inside the start and end dates of the rule', () => {
    const target = rule({ startDate: '2026-11-05', endDate: '2026-11-12' });
    expect(dates(target, '2026-11-01', '2026-11-30')).toEqual([
      '2026-11-05',
      '2026-11-06',
      '2026-11-11',
      '2026-11-12',
    ]);
  });

  it('stays inside the requested range', () => {
    expect(dates(rule(), '2026-11-12', '2026-11-13')).toEqual(['2026-11-12', '2026-11-13']);
  });

  it('returns nothing when the range ends before the rule starts', () => {
    expect(dates(rule({ startDate: '2026-12-01' }), '2026-11-01', '2026-11-30')).toEqual([]);
  });

  it('leaves out skip dates', () => {
    expect(dates(rule({ skipDates: ['2026-11-05'] }), '2026-11-04', '2026-11-06')).toEqual([
      '2026-11-04',
      '2026-11-06',
    ]);
  });

  it('keeps a Saturday and the following Sunday in the same week for a biweekly rule', () => {
    const target = rule({ slots: [slot(SAT), slot(SUN)], startDate: '2026-11-07', intervalWeeks: 2 });
    expect(dates(target, '2026-11-01', '2026-11-30')).toEqual([
      '2026-11-07',
      '2026-11-08',
      '2026-11-21',
      '2026-11-22',
    ]);
  });

  it('counts biweekly weeks from the week the rule starts in, not from its first workday', () => {
    // 시작일 11-05(목)가 속한 주가 0주차다. 그 주의 수요일(11-04)은 시작 전이라 빠진다.
    const target = rule({ startDate: '2026-11-05', intervalWeeks: 2 });
    expect(dates(target, '2026-11-01', '2026-11-30')).toEqual([
      '2026-11-05',
      '2026-11-06',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
    ]);
  });

  it('crosses into the next year', () => {
    expect(dates(rule({ slots: [slot(THU), slot(FRI)] }), '2026-12-30', '2027-01-02')).toEqual([
      '2026-12-31',
      '2027-01-01',
    ]);
  });
});

describe('ruleShiftId', () => {
  it('is the rule ID and the date without dashes', () => {
    expect(ruleShiftId('01JRULE', '2026-11-04')).toBe('r_01JRULE_20261104');
  });
});
