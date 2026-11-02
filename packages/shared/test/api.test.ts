import { describe, expect, it } from 'vitest';
import {
  deductionInputSchema,
  ruleCreateSchema,
  ruleEndSchema,
  ruleSplitSchema,
  settingsSchema,
  shiftCreateSchema,
  shiftUpdateSchema,
  yearMonthSchema,
} from '../src/api';

const planned = { start: '18:00', end: '23:00', breakMin: 0 };

function issuePaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.error?.issues.map((issue) => issue.path.join('.')) ?? [];
}

describe('shiftCreateSchema', () => {
  it('fills defaults for a manually added shift', () => {
    expect(shiftCreateSchema.parse({ workDate: '2026-11-07', planned })).toEqual({
      workDate: '2026-11-07',
      kind: 'EXTRA',
      status: 'SCHEDULED',
      planned,
      actual: null,
      memo: null,
    });
  });

  it('accepts an overnight range', () => {
    const result = shiftCreateSchema.safeParse({
      workDate: '2026-11-07',
      planned: { start: '22:00', end: '06:00', breakMin: 60 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a date that does not exist and a malformed time', () => {
    const result = shiftCreateSchema.safeParse({
      workDate: '2026-02-30',
      planned: { start: '25:00', end: '23:00', breakMin: 0 },
    });
    expect(issuePaths(result)).toEqual(['workDate', 'planned.start']);
  });

  it('rejects equal start and end, and a break as long as the shift', () => {
    expect(
      issuePaths(shiftCreateSchema.safeParse({ workDate: '2026-11-07', planned: { start: '09:00', end: '09:00', breakMin: 0 } })),
    ).toEqual(['planned.end']);
    expect(
      issuePaths(shiftCreateSchema.safeParse({ workDate: '2026-11-07', planned: { start: '09:00', end: '10:00', breakMin: 60 } })),
    ).toEqual(['planned.breakMin']);
  });

  it('turns an empty memo into null', () => {
    expect(shiftCreateSchema.parse({ workDate: '2026-11-07', planned, memo: '  ' }).memo).toBeNull();
  });

  it('requires actual times exactly when the status is WORKED', () => {
    expect(issuePaths(shiftCreateSchema.safeParse({ workDate: '2026-11-07', planned, status: 'WORKED' }))).toEqual([
      'actual',
    ]);
    expect(
      issuePaths(shiftCreateSchema.safeParse({ workDate: '2026-11-07', planned, status: 'ABSENT', actual: planned })),
    ).toEqual(['actual']);
  });
});

describe('shiftUpdateSchema', () => {
  it('requires every field so an update never resets one to a default', () => {
    const result = shiftUpdateSchema.safeParse({ version: 1, workDate: '2026-11-07', planned });
    expect(issuePaths(result).sort()).toEqual(['actual', 'kind', 'memo', 'status']);
  });
});

describe('settingsSchema', () => {
  const valid = {
    hireDate: '2026-07-01',
    periodStartDay: 1,
    payDay: 10,
    weekStartsOn: 1,
    weeklyHolidayMode: 'FOUR_WEEK_AVERAGE',
    eventTitle: ' 알바 ',
    showPayInEvent: true,
  };

  it('trims the event title', () => {
    expect(settingsSchema.parse(valid).eventTitle).toBe('알바');
  });

  it('rejects a period start day that February does not have', () => {
    expect(issuePaths(settingsSchema.safeParse({ ...valid, periodStartDay: 29 }))).toEqual(['periodStartDay']);
  });
});

describe('deductionInputSchema', () => {
  it('accepts social insurance with some items turned off', () => {
    const result = deductionInputSchema.safeParse({
      type: 'SOCIAL_INSURANCE',
      nationalPensionPpm: null,
      healthInsurancePpm: 35_950,
      longTermCarePpm: 131_400,
      employmentInsurancePpm: 9_000,
      earnedIncomeTax: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects rates that are not integers in parts per million', () => {
    const result = deductionInputSchema.safeParse({
      type: 'WITHHOLDING',
      businessIncomeTaxPpm: 3.3,
      localIncomeTaxPpm: 100_000,
    });
    expect(issuePaths(result)).toEqual(['businessIncomeTaxPpm']);
  });
});

describe('yearMonthSchema', () => {
  it('accepts only YYYY-MM with a real month', () => {
    expect(yearMonthSchema.safeParse('2026-11').success).toBe(true);
    expect(yearMonthSchema.safeParse('2026-13').success).toBe(false);
    expect(yearMonthSchema.safeParse('2026-1').success).toBe(false);
  });
});

describe('ruleCreateSchema', () => {
  const valid = {
    slots: [
      { dayOfWeek: 3, start: '18:00', end: '23:00', breakMin: 0 },
      { dayOfWeek: 5, start: '22:00', end: '06:00', breakMin: 60 },
    ],
    startDate: '2026-11-04',
    endDate: null,
    intervalWeeks: 1,
  };

  it('accepts an open-ended weekly rule with an overnight slot', () => {
    expect(ruleCreateSchema.parse(valid)).toEqual(valid);
  });

  it('rejects the same weekday twice', () => {
    const slots = [valid.slots[0], { ...valid.slots[0], start: '09:00', end: '10:00' }];
    expect(issuePaths(ruleCreateSchema.safeParse({ ...valid, slots }))).toEqual(['slots.1.dayOfWeek']);
  });

  it('rejects a rule without slots', () => {
    expect(issuePaths(ruleCreateSchema.safeParse({ ...valid, slots: [] }))).toEqual(['slots']);
  });

  it('checks each slot like a shift time range', () => {
    const slots = [{ dayOfWeek: 3, start: '09:00', end: '10:00', breakMin: 60 }];
    expect(issuePaths(ruleCreateSchema.safeParse({ ...valid, slots }))).toEqual(['slots.0.breakMin']);
  });

  it('rejects an end date before the start date', () => {
    expect(issuePaths(ruleCreateSchema.safeParse({ ...valid, endDate: '2026-11-03' }))).toEqual(['endDate']);
  });

  it('accepts only weekly and biweekly intervals', () => {
    expect(ruleCreateSchema.safeParse({ ...valid, intervalWeeks: 2 }).success).toBe(true);
    expect(issuePaths(ruleCreateSchema.safeParse({ ...valid, intervalWeeks: 3 }))).toEqual(['intervalWeeks']);
  });
});

describe('ruleSplitSchema', () => {
  it('compares the end date with the date the change starts from', () => {
    const result = ruleSplitSchema.safeParse({
      version: 1,
      fromDate: '2026-12-01',
      slots: [{ dayOfWeek: 6, start: '12:00', end: '18:00', breakMin: 30 }],
      endDate: '2026-11-30',
      intervalWeeks: 1,
    });
    expect(issuePaths(result)).toEqual(['endDate']);
  });
});

describe('ruleEndSchema', () => {
  it('requires the version and the first date without work', () => {
    expect(issuePaths(ruleEndSchema.safeParse({})).sort()).toEqual(['fromDate', 'version']);
  });
});
