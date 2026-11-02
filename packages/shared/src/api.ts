import { z } from 'zod';
import { clockRangeMinutes, isClockTime } from './clock';
import { toDayNumber, type DayOfWeek, type LocalDateTime } from './date';
import type { DeductionProfile } from './deductions';
import type { PayrollResult } from './payroll';
import type { Shift, WageEntry } from './types';

// API의 요청 검사와 웹의 입력 폼이 같은 스키마를 쓴다.

function isLocalDate(value: string): boolean {
  try {
    toDayNumber(value);
    return true;
  } catch {
    return false;
  }
}

export const localDateSchema = z
  .string()
  .refine(isLocalDate, { message: '날짜는 YYYY-MM-DD 형식의 실제 날짜여야 합니다.' });

export const yearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: '연월은 YYYY-MM 형식이어야 합니다.' });

export const clockTimeSchema = z
  .string()
  .refine(isClockTime, { message: '시각은 HH:mm 형식이어야 합니다.' });

export const clockRangeSchema = z
  .object({
    start: clockTimeSchema,
    end: clockTimeSchema,
    breakMin: z.number().int().min(0),
  })
  .superRefine((range, ctx) => {
    if (!isClockTime(range.start) || !isClockTime(range.end)) return;
    if (range.start === range.end) {
      ctx.addIssue({ code: 'custom', path: ['end'], message: '시작과 종료 시각이 같습니다.' });
    } else if (range.breakMin >= clockRangeMinutes(range.start, range.end)) {
      ctx.addIssue({
        code: 'custom',
        path: ['breakMin'],
        message: '휴게 시간이 근무 시간 이상입니다.',
      });
    }
  });

const dayOfWeekSchema = z
  .number()
  .int()
  .min(0)
  .max(6)
  .transform((value) => value as DayOfWeek);

export const settingsSchema = z.object({
  hireDate: localDateSchema,
  /** 정산 기간이 시작하는 날. 29~31일은 2월에 없어서 받지 않는다. */
  periodStartDay: z.number().int().min(1).max(28),
  /** 정산 기간이 끝난 다음 달의 급여일 */
  payDay: z.number().int().min(1).max(28),
  weekStartsOn: dayOfWeekSchema,
  weeklyHolidayMode: z.enum(['FOUR_WEEK_AVERAGE', 'SINGLE_WEEK']),
  /** 캘린더 일정 제목 */
  eventTitle: z.string().trim().min(1).max(40),
  /** 캘린더 일정 설명에 예상 급여를 넣을지 */
  showPayInEvent: z.boolean(),
});
export type AppSettings = z.output<typeof settingsSchema>;

export const wageInputSchema = z.object({
  hourlyWage: z.number().int().min(1).max(1_000_000),
});

const ppmSchema = z.number().int().min(0).max(1_000_000);

export const deductionInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('NONE') }),
  z.object({
    type: z.literal('WITHHOLDING'),
    businessIncomeTaxPpm: ppmSchema,
    localIncomeTaxPpm: ppmSchema,
  }),
  z.object({
    type: z.literal('SOCIAL_INSURANCE'),
    nationalPensionPpm: ppmSchema.nullable(),
    healthInsurancePpm: ppmSchema.nullable(),
    longTermCarePpm: ppmSchema.nullable(),
    employmentInsurancePpm: ppmSchema.nullable(),
    earnedIncomeTax: z.number().int().min(0),
  }),
]);
export type DeductionInput = z.output<typeof deductionInputSchema>;

const shiftKindSchema = z.enum(['REGULAR', 'EXTRA']);
const shiftStatusSchema = z.enum(['SCHEDULED', 'WORKED', 'ABSENT', 'CANCELLED']);
const memoSchema = z
  .string()
  .trim()
  .max(200)
  .nullable()
  .transform((memo) => (memo === '' ? null : memo));

/** 실제 시각은 '근무함' 상태에서만 있고, 그 상태에서는 반드시 있다. */
function checkActualMatchesStatus(
  shift: { status: string; actual: unknown },
  ctx: z.RefinementCtx,
): void {
  if (shift.status === 'WORKED' && shift.actual === null) {
    ctx.addIssue({ code: 'custom', path: ['actual'], message: '근무함 상태에는 실제 시각이 필요합니다.' });
  }
  if (shift.status !== 'WORKED' && shift.actual !== null) {
    ctx.addIssue({ code: 'custom', path: ['actual'], message: '실제 시각은 근무함 상태에서만 넣을 수 있습니다.' });
  }
}

export const shiftCreateSchema = z
  .object({
    workDate: localDateSchema,
    kind: shiftKindSchema.default('EXTRA'),
    status: shiftStatusSchema.default('SCHEDULED'),
    planned: clockRangeSchema,
    actual: clockRangeSchema.nullable().default(null),
    memo: memoSchema.default(null),
  })
  .superRefine(checkActualMatchesStatus);
export type ShiftCreateInput = z.output<typeof shiftCreateSchema>;

/** 수정은 전체 교체다. 생략한 필드를 기본값으로 바꾸지 않도록 모든 필드를 받는다. */
export const shiftUpdateSchema = z
  .object({
    version: z.number().int().min(1),
    workDate: localDateSchema,
    kind: shiftKindSchema,
    status: shiftStatusSchema,
    planned: clockRangeSchema,
    actual: clockRangeSchema.nullable(),
    memo: memoSchema,
  })
  .superRefine(checkActualMatchesStatus);
export type ShiftUpdateInput = z.output<typeof shiftUpdateSchema>;

/** 저장된 근무. 급여 계산 엔진의 `Shift`에 저장·동기화용 필드를 더한 것 */
export interface ShiftRecord extends Shift {
  /** 반복 규칙에서 생긴 근무면 그 규칙 ID */
  ruleId: string | null;
  actualStart: LocalDateTime | null;
  actualEnd: LocalDateTime | null;
  actualBreakMin: number | null;
  /** 규칙에서 생긴 근무를 따로 고쳤으면 true. 규칙을 바꿔도 다시 만들지 않는다. */
  detached: boolean;
  memo: string | null;
  /** 낙관적 잠금용. 수정할 때마다 1씩 오른다. */
  version: number;
  /** 마지막으로 쓴 시각. ISO 8601 형식의 UTC */
  updatedAt: string;
}

export interface ConfigResponse {
  /** 아직 저장하지 않았으면 null */
  settings: AppSettings | null;
  wages: WageEntry[];
  deductions: DeductionProfile[];
}

export interface PayrollResponse extends PayrollResult {
  /** 확정한 기간이면 확정 시점의 결과를 그대로 돌려준다. */
  locked: boolean;
  lockedAt: string | null;
}

export type ApiErrorCode =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'PERIOD_LOCKED'
  | 'PERIOD_NOT_ENDED'
  | 'NOT_CONFIGURED'
  | 'INTERNAL';

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: { path: string; message: string }[];
  };
}
