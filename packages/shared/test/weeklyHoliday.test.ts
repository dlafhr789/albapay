import { describe, expect, it } from 'vitest';
import type { Period } from '../src/types';
import { calculateWeeklyHoliday, weeksEndingIn } from '../src/weeklyHoliday';
import {
  FRI,
  MON,
  SAT,
  THU,
  TUE,
  WAGE_10320,
  WED,
  settings,
  shift,
  weekly,
} from './helpers';

const NOVEMBER: Period = { start: '2026-11-01', end: '2026-11-30' };
const MON_WED_FRI_EVENING = [
  [MON, '18:00', '23:00'],
  [WED, '18:00', '23:00'],
  [FRI, '18:00', '23:00'],
] as const;

function weekOf(weeks: ReturnType<typeof calculateWeeklyHoliday>, weekStart: string) {
  const week = weeks.find((w) => w.weekStart === weekStart);
  if (!week) throw new Error(`no week starting ${weekStart}`);
  return week;
}

describe('weeksEndingIn', () => {
  it('includes a week that starts in the previous month but ends in this period', () => {
    expect(weeksEndingIn(NOVEMBER, 1).map((w) => w.weekEnd)).toEqual([
      '2026-11-01',
      '2026-11-08',
      '2026-11-15',
      '2026-11-22',
      '2026-11-29',
    ]);
  });
});

describe('calculateWeeklyHoliday', () => {
  it('case 1: pays 3 hours of holiday pay for exactly 15 hours a week', () => {
    const weeks = calculateWeeklyHoliday({
      shifts: weekly('2026-11-02', '2026-11-08', [...MON_WED_FRI_EVENING]),
      wages: WAGE_10320,
      settings: settings({ hireDate: '2026-11-02' }),
      period: NOVEMBER,
      today: '2026-12-01',
    });
    const week = weekOf(weeks, '2026-11-02');
    expect(week.eligible).toBe(true);
    expect(week.holidayMinutes).toBe(180);
    expect(week.amount).toBe(30_960);
  });

  it('case 2: pays nothing under 15 hours a week', () => {
    const weeks = calculateWeeklyHoliday({
      shifts: weekly('2026-11-02', '2026-11-29', [
        [TUE, '13:00', '20:00'],
        [THU, '13:00', '20:00'],
      ]),
      wages: WAGE_10320,
      settings: settings({ hireDate: '2026-11-02' }),
      period: NOVEMBER,
      today: '2026-12-01',
    });
    const week = weekOf(weeks, '2026-11-23');
    expect(week.averageContractMinutes).toBe(840);
    expect(week.eligible).toBe(false);
    expect(week.amount).toBe(0);
  });

  it('case 3: judges each week by the average of up to 4 weeks since hire', () => {
    const shifts = [
      // 1주: 12시간
      shift('2026-11-02', '10:00', '16:00'),
      shift('2026-11-04', '10:00', '16:00'),
      // 2주: 18시간
      shift('2026-11-09', '10:00', '16:00'),
      shift('2026-11-11', '10:00', '16:00'),
      shift('2026-11-13', '10:00', '16:00'),
      // 3주: 14시간
      shift('2026-11-16', '10:00', '17:00'),
      shift('2026-11-18', '10:00', '17:00'),
      // 4주: 20시간
      shift('2026-11-23', '10:00', '15:00'),
      shift('2026-11-25', '10:00', '15:00'),
      shift('2026-11-27', '10:00', '15:00'),
      shift('2026-11-28', '10:00', '15:00'),
    ];
    const weeks = calculateWeeklyHoliday({
      shifts,
      wages: WAGE_10320,
      settings: settings({ hireDate: '2026-11-02' }),
      period: NOVEMBER,
      today: '2026-12-01',
    });

    expect(weekOf(weeks, '2026-10-26').averagedWeeks).toBe(0);
    expect(weekOf(weeks, '2026-11-02').amount).toBe(0);
    expect(weekOf(weeks, '2026-11-09')).toMatchObject({ averageContractMinutes: 900, amount: 37_152 });
    expect(weekOf(weeks, '2026-11-16')).toMatchObject({ averageContractMinutes: 880, amount: 0 });
    expect(weekOf(weeks, '2026-11-23')).toMatchObject({
      averagedWeeks: 4,
      averageContractMinutes: 960,
      amount: 41_280,
    });
  });

  it('case 3 in single-week mode: judges each week on its own', () => {
    const shifts = [
      shift('2026-11-02', '10:00', '16:00'),
      shift('2026-11-04', '10:00', '16:00'),
      shift('2026-11-09', '10:00', '16:00'),
      shift('2026-11-11', '10:00', '16:00'),
      shift('2026-11-13', '10:00', '16:00'),
      shift('2026-11-16', '10:00', '17:00'),
      shift('2026-11-18', '10:00', '17:00'),
    ];
    const weeks = calculateWeeklyHoliday({
      shifts,
      wages: WAGE_10320,
      settings: settings({ hireDate: '2026-11-02', weeklyHolidayMode: 'SINGLE_WEEK' }),
      period: NOVEMBER,
      today: '2026-12-01',
    });
    expect(weekOf(weeks, '2026-11-09').amount).toBe(37_152);
    expect(weekOf(weeks, '2026-11-16').amount).toBe(0);
  });

  it('case 4: an absence breaks the week', () => {
    const weeks = calculateWeeklyHoliday({
      shifts: [
        shift('2026-11-02', '18:00', '23:00'),
        shift('2026-11-04', '18:00', '23:00', { status: 'ABSENT' }),
        shift('2026-11-06', '18:00', '23:00'),
      ],
      wages: WAGE_10320,
      settings: settings({ hireDate: '2026-11-02' }),
      period: NOVEMBER,
      today: '2026-12-01',
    });
    const week = weekOf(weeks, '2026-11-02');
    expect(week.contractMinutes).toBe(900);
    expect(week.attended).toBe(false);
    expect(week.amount).toBe(0);
  });

  it('a cancelled day comes out of the contract hours without breaking attendance', () => {
    const weeks = calculateWeeklyHoliday({
      shifts: [
        shift('2026-11-02', '18:00', '23:00'),
        shift('2026-11-04', '18:00', '23:00'),
        shift('2026-11-06', '18:00', '23:00', { status: 'CANCELLED' }),
      ],
      wages: WAGE_10320,
      settings: settings({ hireDate: '2026-11-02' }),
      period: NOVEMBER,
      today: '2026-12-01',
    });
    const week = weekOf(weeks, '2026-11-02');
    expect(week).toMatchObject({ contractMinutes: 600, attended: true, eligible: false });
  });

  it('case 5: overtime and extra shifts do not count toward contract hours', () => {
    const weeks = calculateWeeklyHoliday({
      shifts: [
        shift('2026-11-02', '18:00', '23:00'),
        shift('2026-11-04', '18:00', '23:00'),
        shift('2026-11-06', '18:00', '23:00', {
          status: 'WORKED',
          actualStart: '2026-11-06T18:00',
          actualEnd: '2026-11-07T00:00',
        }),
        shift('2026-11-07', '10:00', '14:00', { kind: 'EXTRA' }),
      ],
      wages: WAGE_10320,
      settings: settings({ hireDate: '2026-11-02' }),
      period: NOVEMBER,
      today: '2026-12-01',
    });
    const week = weekOf(weeks, '2026-11-02');
    expect(week.contractMinutes).toBe(900);
    expect(week.actualMinutes).toBe(1_200);
    expect(week.amount).toBe(30_960);
  });

  it('case 6: caps holiday pay at 8 hours for 40+ hours a week', () => {
    const weeks = calculateWeeklyHoliday({
      shifts: weekly('2026-11-02', '2026-11-07', [
        [MON, '09:00', '16:00'],
        [TUE, '09:00', '16:00'],
        [WED, '09:00', '16:00'],
        [THU, '09:00', '16:00'],
        [FRI, '09:00', '16:00'],
        [SAT, '09:00', '16:00'],
      ]),
      wages: WAGE_10320,
      settings: settings({ hireDate: '2026-11-02' }),
      period: NOVEMBER,
      today: '2026-12-01',
    });
    const week = weekOf(weeks, '2026-11-02');
    expect(week.contractMinutes).toBe(2_520);
    expect(week.holidayMinutes).toBe(480);
    expect(week.amount).toBe(82_560);
  });

  it('case 8: belongs to the period of the last day and uses that day’s wage', () => {
    const wages = [...WAGE_10320, { effectiveFrom: '2027-01-01', hourlyWage: 10_700 }];
    const shifts = weekly('2026-12-28', '2027-01-03', [...MON_WED_FRI_EVENING]);
    const input = { shifts, wages, settings: settings({ hireDate: '2026-12-28' }), today: '2027-02-01' };

    const december = calculateWeeklyHoliday({ ...input, period: { start: '2026-12-01', end: '2026-12-31' } });
    const january = calculateWeeklyHoliday({ ...input, period: { start: '2027-01-01', end: '2027-01-31' } });

    expect(december.find((w) => w.weekStart === '2026-12-28')).toBeUndefined();
    expect(weekOf(january, '2026-12-28').amount).toBe(32_100);
  });

  it('uses weeks before the period for the 4-week average', () => {
    const shifts = weekly('2026-10-05', '2026-11-08', [...MON_WED_FRI_EVENING]);
    const weeks = calculateWeeklyHoliday({
      shifts,
      wages: WAGE_10320,
      settings: settings({ hireDate: '2026-07-01' }),
      period: NOVEMBER,
      today: '2026-11-04',
    });
    expect(weekOf(weeks, '2026-10-26')).toMatchObject({ averagedWeeks: 4, amount: 30_960, final: true });
    expect(weekOf(weeks, '2026-11-02')).toMatchObject({ amount: 30_960, final: false });
  });
});
