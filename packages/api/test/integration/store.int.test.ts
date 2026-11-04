import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppSettings, PayrollResult } from '@albapay/shared';
import { StoreError } from '../../src/db/errors';
import type { Store } from '../../src/db/store';
import { createTestStore, shiftRecord } from './helpers';

let store: Store;
let drop: () => Promise<void>;

beforeAll(async () => {
  ({ store, drop } = await createTestStore());
});

afterAll(async () => {
  await drop?.();
});

async function expectStoreError(promise: Promise<unknown>, code: StoreError['code']) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(StoreError);
  expect((error as StoreError).code).toBe(code);
}

describe('config', () => {
  it('fills calendar fields that settings saved before they existed do not have', async () => {
    const { store: legacyStore, drop: dropLegacy } = await createTestStore();
    try {
      // 이동 시간과 알림 필드가 생기기 전에 저장한 설정과 같은 모양이다.
      const legacy = {
        hireDate: '2026-07-01',
        periodStartDay: 1,
        payDay: 10,
        weekStartsOn: 1,
        weeklyHolidayMode: 'FOUR_WEEK_AVERAGE',
        eventTitle: '알바',
        showPayInEvent: true,
      };
      await legacyStore.putSettings(legacy as AppSettings);
      expect((await legacyStore.loadConfig()).settings).toEqual({ ...legacy, eventTravelMin: 0, eventAlertMin: null });
    } finally {
      await dropLegacy();
    }
  });

  it('returns empty config before anything is saved', async () => {
    expect(await store.loadConfig()).toEqual({ settings: null, wages: [], deductions: [] });
  });

  it('reads settings and histories back in effective-date order, without tokens', async () => {
    await store.putTokenHash('api', 'a'.repeat(64), '2026-11-02T08:00:00.000Z');
    await store.putSettings({
      hireDate: '2026-07-01',
      periodStartDay: 1,
      payDay: 10,
      weekStartsOn: 1,
      weeklyHolidayMode: 'FOUR_WEEK_AVERAGE',
      eventTitle: '알바',
      showPayInEvent: true,
      eventTravelMin: 0,
      eventAlertMin: null,
    });
    await store.putWage({ effectiveFrom: '2027-01-01', hourlyWage: 10_700 });
    await store.putWage({ effectiveFrom: '2026-01-01', hourlyWage: 10_320 });
    await store.putDeduction({
      effectiveFrom: '2026-01-01',
      type: 'SOCIAL_INSURANCE',
      nationalPensionPpm: null,
      healthInsurancePpm: 35_950,
      longTermCarePpm: 131_400,
      employmentInsurancePpm: 9_000,
      earnedIncomeTax: 0,
    });

    const config = await store.loadConfig();
    expect(config.settings).toMatchObject({ payDay: 10, eventTitle: '알바' });
    expect(config.wages).toEqual([
      { effectiveFrom: '2026-01-01', hourlyWage: 10_320 },
      { effectiveFrom: '2027-01-01', hourlyWage: 10_700 },
    ]);
    expect(config.deductions).toEqual([
      {
        effectiveFrom: '2026-01-01',
        type: 'SOCIAL_INSURANCE',
        nationalPensionPpm: null,
        healthInsurancePpm: 35_950,
        longTermCarePpm: 131_400,
        employmentInsurancePpm: 9_000,
        earnedIncomeTax: 0,
      },
    ]);
    expect(await store.getTokenHash('api')).toBe('a'.repeat(64));
    expect(await store.getTokenHash('cal')).toBeNull();
  });

  it('reports whether a deleted history entry existed', async () => {
    expect(await store.deleteWage('2027-01-01')).toBe(true);
    expect(await store.deleteWage('2027-01-01')).toBe(false);
    expect((await store.loadConfig()).wages).toHaveLength(1);
  });
});

describe('shifts', () => {
  it('lists shifts across month partitions in date order', async () => {
    const late = shiftRecord('2026-12-01');
    const early = shiftRecord('2026-11-30', { plannedStart: '2026-11-30T09:00', plannedEnd: '2026-11-30T13:00' });
    const evening = shiftRecord('2026-11-30');
    for (const shift of [late, evening, early]) await store.createShift(shift);

    expect((await store.listShiftsBetween('2026-11-30', '2026-12-01')).map((s) => s.id)).toEqual([
      early.id,
      evening.id,
      late.id,
    ]);
    expect((await store.listShiftsByMonth('2026-12')).map((s) => s.id)).toEqual([late.id]);
    expect(await store.listShiftsBetween('2026-11-01', '2026-11-29')).toEqual([]);
  });

  it('refuses to create the same shift twice', async () => {
    const shift = shiftRecord('2026-11-04');
    await store.createShift(shift);
    await expectStoreError(store.createShift(shift), 'ALREADY_EXISTS');
  });

  it('replaces a shift only at the expected version', async () => {
    const shift = shiftRecord('2026-11-05');
    await store.createShift(shift);

    await store.replaceShift({ ...shift, memo: '첫 수정', version: 2 }, 1);
    await expectStoreError(store.replaceShift({ ...shift, memo: '늦은 수정', version: 2 }, 1), 'VERSION_CONFLICT');

    expect(await store.getShift('2026-11-05', shift.id)).toMatchObject({ memo: '첫 수정', version: 2 });
  });

  it('reports a missing shift as not found rather than a conflict', async () => {
    const ghost = shiftRecord('2026-11-06');
    await expectStoreError(store.replaceShift(ghost, 1), 'NOT_FOUND');
    await expectStoreError(store.deleteShift(ghost.workDate, ghost.id, 1), 'NOT_FOUND');
  });

  it('deletes a shift only at the expected version', async () => {
    const shift = shiftRecord('2026-11-07');
    await store.createShift(shift);
    await expectStoreError(store.deleteShift(shift.workDate, shift.id, 2), 'VERSION_CONFLICT');
    await store.deleteShift(shift.workDate, shift.id, 1);
    expect(await store.getShift(shift.workDate, shift.id)).toBeNull();
  });

  it('moves a shift to another month in one transaction', async () => {
    const shift = shiftRecord('2026-11-27');
    await store.createShift(shift);
    const moved = { ...shift, workDate: '2026-12-02', plannedStart: '2026-12-02T18:00', plannedEnd: '2026-12-02T23:00', version: 2 };

    await store.moveShift({ workDate: shift.workDate, id: shift.id, expectedVersion: 1 }, null, moved);

    expect(await store.getShift('2026-11-27', shift.id)).toBeNull();
    expect(await store.getShift('2026-12-02', shift.id)).toMatchObject({ version: 2 });
  });

  it('changes nothing when a move hits a stale version', async () => {
    const shift = shiftRecord('2026-11-20');
    await store.createShift(shift);
    const moved = { ...shift, workDate: '2026-11-21', version: 2 };

    await expectStoreError(
      store.moveShift({ workDate: shift.workDate, id: shift.id, expectedVersion: 5 }, null, moved),
      'VERSION_CONFLICT',
    );

    expect(await store.getShift('2026-11-20', shift.id)).toMatchObject({ version: 1 });
    expect(await store.getShift('2026-11-21', shift.id)).toBeNull();
  });

  it('keeps a rule-generated shift as cancelled when it is moved', async () => {
    const fromRule = shiftRecord('2026-11-18', { id: 'r_rule1_20261118', ruleId: 'rule1' });
    await store.createShift(fromRule);
    const cancelled = { ...fromRule, status: 'CANCELLED' as const, detached: true, version: 2 };
    const created = shiftRecord('2026-11-19', { ruleId: null });

    await store.moveShift({ workDate: fromRule.workDate, id: fromRule.id, expectedVersion: 1 }, cancelled, created);

    expect(await store.getShift('2026-11-18', fromRule.id)).toMatchObject({ status: 'CANCELLED', detached: true });
    expect(await store.getShift('2026-11-19', created.id)).toMatchObject({ ruleId: null, version: 1 });
  });
});

describe('payslips', () => {
  const result = { gross: 0, net: 0, warnings: [] } as unknown as PayrollResult;
  const payslip = { periodStart: '2026-10-01', periodEnd: '2026-10-31', lockedAt: '2026-11-10T01:00:00.000Z', result };

  it('locks a period once and unlocks it', async () => {
    expect(await store.createPayslip(payslip)).toBe(true);
    expect(await store.createPayslip({ ...payslip, lockedAt: '2026-11-11T01:00:00.000Z' })).toBe(false);
    expect(await store.getPayslip('2026-10-01')).toEqual(payslip);
    expect(await store.listPayslips()).toEqual([payslip]);

    expect(await store.deletePayslip('2026-10-01')).toBe(true);
    expect(await store.listPayslips()).toEqual([]);
  });
});
