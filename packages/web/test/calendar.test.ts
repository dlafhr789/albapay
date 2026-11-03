import { describe, expect, it } from 'vitest';
import type { PayrollResult, ShiftRecord } from '@albapay/shared';
import { chipFor, monthCells } from '../src/lib/calendar';
import { splitGross } from '../src/lib/payroll';

function shift(workDate: string, overrides: Partial<ShiftRecord> = {}): ShiftRecord {
  return {
    id: `s-${workDate}`,
    workDate,
    ruleId: null,
    kind: 'REGULAR',
    status: 'SCHEDULED',
    plannedStart: `${workDate}T18:00`,
    plannedEnd: `${workDate}T23:00`,
    plannedBreakMin: 0,
    actualStart: null,
    actualEnd: null,
    actualBreakMin: null,
    detached: false,
    memo: null,
    version: 1,
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('monthCells', () => {
  it('covers whole weeks from Monday, five or six of them', () => {
    const november = monthCells('2026-11', [], '2026-11-03');
    expect(november).toHaveLength(42);
    expect(november[0]).toMatchObject({ date: '2026-10-26', inMonth: false });
    expect(november.at(-1)).toMatchObject({ date: '2026-12-06', inMonth: false });

    expect(monthCells('2027-02', [], '2026-11-03')).toHaveLength(28);
  });

  it('puts shifts on their work date and marks today', () => {
    const cells = monthCells('2026-11', [shift('2026-11-04')], '2026-11-03');
    expect(cells.find((cell) => cell.date === '2026-11-04')?.shifts).toHaveLength(1);
    expect(cells.find((cell) => cell.today)?.date).toBe('2026-11-03');
  });
});

describe('chipFor', () => {
  it('fills past scheduled shifts as worked, like the payroll does', () => {
    expect(chipFor(shift('2026-11-02'), '2026-11-03')).toEqual({ kind: 'worked', label: '5h' });
    expect(chipFor(shift('2026-11-04'), '2026-11-03')).toEqual({ kind: 'planned', label: '5h' });
  });

  it('shows the actual time when it was recorded', () => {
    const worked = shift('2026-11-02', { status: 'WORKED', actualStart: '2026-11-02T17:00', actualEnd: '2026-11-02T23:30', actualBreakMin: 0 });
    expect(chipFor(worked, '2026-11-03')?.label).toBe('6:30');
  });

  it('marks extra shifts and absences, and hides cancelled ones', () => {
    expect(chipFor(shift('2026-11-04', { kind: 'EXTRA' }), '2026-11-03')?.kind).toBe('extra');
    expect(chipFor(shift('2026-11-04', { status: 'ABSENT' }), '2026-11-03')).toEqual({ kind: 'absent', label: '결근' });
    expect(chipFor(shift('2026-11-04', { status: 'CANCELLED' }), '2026-11-03')).toBeNull();
  });
});

describe('splitGross', () => {
  it('counts finished weeks of weekly holiday pay as confirmed', () => {
    const result = {
      gross: 887_520,
      base: { confirmedPay: 371_520 },
      weeklyHoliday: [
        { amount: 30_960, final: true },
        { amount: 30_960, final: true },
        { amount: 30_960, final: false },
      ],
    } as unknown as PayrollResult;
    expect(splitGross(result)).toEqual({ gross: 887_520, confirmed: 433_440, expected: 454_080 });
  });
});
