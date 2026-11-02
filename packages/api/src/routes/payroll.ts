import { Hono } from 'hono';
import { z } from 'zod';
import {
  calculatePayroll,
  periodStartingIn,
  shiftRangeFor,
  todayInSeoul,
  yearMonthSchema,
  type AppSettings,
  type ConfigResponse,
  type LocalDate,
  type PayrollResponse,
  type PayrollResult,
  type Period,
} from '@albapay/shared';
import type { PayslipRecord, Store } from '../db/store';
import type { AppDeps } from '../deps';
import { ApiError, notFound } from '../http/errors';
import { parse } from '../http/validate';

/** 정산 기간은 시작하는 달(`YYYY-MM`)로 가리킨다. */
const periodParam = z.object({ period: yearMonthSchema });

function requireSettings(config: ConfigResponse): AppSettings {
  if (!config.settings) throw new ApiError(409, 'NOT_CONFIGURED', '설정을 먼저 저장하세요.');
  return config.settings;
}

async function compute(
  store: Store,
  config: ConfigResponse,
  settings: AppSettings,
  period: Period,
  today: LocalDate,
): Promise<PayrollResult> {
  // 기간 첫 주의 4주 평균을 내려면 그 주보다 3주 앞의 근무까지 읽어야 한다.
  const range = shiftRangeFor(period, settings.weekStartsOn);
  return calculatePayroll({
    period,
    today,
    settings,
    wages: config.wages,
    deductionProfiles: config.deductions,
    shifts: await store.listShiftsBetween(range.from, range.to),
  });
}

function lockedResponse(payslip: PayslipRecord): PayrollResponse {
  return { ...payslip.result, locked: true, lockedAt: payslip.lockedAt };
}

export function payrollRoutes({ store, now }: AppDeps): Hono {
  const app = new Hono();

  app.get('/payroll', async (c) => {
    const { period: month } = parse(periodParam, c.req.query());
    const config = await store.loadConfig();
    const settings = requireSettings(config);
    const period = periodStartingIn(month, settings.periodStartDay);

    // 확정한 기간은 다시 계산하지 않는다. 나중에 시급이나 요율을 고쳐도 지난 급여 기록이 바뀌지 않게 하기 위해서다.
    const payslip = await store.getPayslip(period.start);
    if (payslip) return c.json(lockedResponse(payslip));

    const result = await compute(store, config, settings, period, todayInSeoul(now()));
    return c.json<PayrollResponse>({ ...result, locked: false, lockedAt: null });
  });

  app.post('/payroll/:period/lock', async (c) => {
    const { period: month } = parse(periodParam, c.req.param());
    const config = await store.loadConfig();
    const settings = requireSettings(config);
    const period = periodStartingIn(month, settings.periodStartDay);
    const today = todayInSeoul(now());
    if (period.end >= today) {
      throw new ApiError(
        409,
        'PERIOD_NOT_ENDED',
        `정산 기간이 끝난 뒤(${period.end} 다음 날부터)에 확정할 수 있습니다.`,
      );
    }

    const payslip: PayslipRecord = {
      periodStart: period.start,
      periodEnd: period.end,
      lockedAt: now().toISOString(),
      result: await compute(store, config, settings, period, today),
    };
    if (await store.createPayslip(payslip)) return c.json(lockedResponse(payslip), 201);

    // 이미 확정했으면 처음 확정한 결과를 그대로 돌려준다.
    const existing = await store.getPayslip(period.start);
    if (!existing) throw new Error('확정 기록을 쓰지도 읽지도 못했습니다.');
    return c.json(lockedResponse(existing));
  });

  app.delete('/payroll/:period/lock', async (c) => {
    const { period: month } = parse(periodParam, c.req.param());
    const settings = requireSettings(await store.loadConfig());
    const period = periodStartingIn(month, settings.periodStartDay);
    if (!(await store.deletePayslip(period.start))) throw notFound('확정한 정산이 없습니다.');
    return c.body(null, 204);
  });

  return app;
}
