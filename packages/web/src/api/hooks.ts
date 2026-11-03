import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ConfigResponse,
  LocalDate,
  PayrollResponse,
  RuleCreateInput,
  RuleEndInput,
  RuleRecord,
  RuleSplitInput,
  ShiftCreateInput,
  ShiftRecord,
  ShiftUpdateInput,
} from '@albapay/shared';
import { request } from './client';

export const keys = {
  config: ['config'] as const,
  shifts: (month: string) => ['shifts', month] as const,
  allShifts: ['shifts'] as const,
  payroll: (period: string) => ['payroll', period] as const,
  allPayroll: ['payroll'] as const,
  rules: ['rules'] as const,
};

export function useConfig() {
  return useQuery({ queryKey: keys.config, queryFn: () => request<ConfigResponse>('GET', '/api/config') });
}

export function useShifts(month: string) {
  return useQuery({
    queryKey: keys.shifts(month),
    queryFn: async () => (await request<{ shifts: ShiftRecord[] }>('GET', `/api/shifts?month=${month}`)).shifts,
  });
}

export function usePayroll(period: string) {
  return useQuery({
    queryKey: keys.payroll(period),
    queryFn: () => request<PayrollResponse>('GET', `/api/payroll?period=${period}`),
  });
}

export function useRules() {
  return useQuery({
    queryKey: keys.rules,
    queryFn: async () => (await request<{ rules: RuleRecord[] }>('GET', '/api/rules')).rules,
  });
}

/** 근무가 바뀌면 근무 목록과 모든 정산을 다시 읽는다. 주휴수당이 앞뒤 기간에 걸쳐 있어서 정산을 골라 지우기 어렵다. */
function useInvalidateShifts() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: keys.allShifts }),
      client.invalidateQueries({ queryKey: keys.allPayroll }),
    ]);
}

/** 화면에서 입력받는 근무 내용. 서버 스키마와 같은 모양이다. */
export type ShiftInput = ShiftCreateInput;

export function useCreateShift() {
  const invalidate = useInvalidateShifts();
  return useMutation({
    mutationFn: (input: ShiftInput) => request<ShiftRecord>('POST', '/api/shifts', { body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateShift() {
  const invalidate = useInvalidateShifts();
  return useMutation({
    mutationFn: ({ current, input }: { current: ShiftRecord; input: ShiftUpdateInput }) =>
      request<ShiftRecord>('PUT', `/api/shifts/${current.workDate}/${encodeURIComponent(current.id)}`, { body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteShift() {
  const invalidate = useInvalidateShifts();
  return useMutation({
    mutationFn: (shift: ShiftRecord) =>
      request<ShiftRecord | undefined>(
        'DELETE',
        `/api/shifts/${shift.workDate}/${encodeURIComponent(shift.id)}?version=${shift.version}`,
      ),
    onSuccess: invalidate,
  });
}

export function monthOf(date: LocalDate): string {
  return date.slice(0, 7);
}

export function useLockPayroll() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (period: string) => request<PayrollResponse>('POST', `/api/payroll/${period}/lock`, { body: {} }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.allPayroll }),
  });
}

export function useUnlockPayroll() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (period: string) => request<undefined>('DELETE', `/api/payroll/${period}/lock`),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.allPayroll }),
  });
}

function useInvalidateRules() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: keys.rules }),
      client.invalidateQueries({ queryKey: keys.allShifts }),
      client.invalidateQueries({ queryKey: keys.allPayroll }),
    ]);
}

export function useCreateRule() {
  const invalidate = useInvalidateRules();
  return useMutation({
    mutationFn: (input: RuleCreateInput) => request<RuleRecord>('POST', '/api/rules', { body: input }),
    onSuccess: invalidate,
  });
}

export function useSplitRule() {
  const invalidate = useInvalidateRules();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RuleSplitInput }) =>
      request<{ previous: RuleRecord | null; next: RuleRecord }>('POST', `/api/rules/${encodeURIComponent(id)}/split`, { body: input }),
    onSuccess: invalidate,
  });
}

export function useEndRule() {
  const invalidate = useInvalidateRules();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RuleEndInput }) =>
      request<{ rule: RuleRecord | null }>('POST', `/api/rules/${encodeURIComponent(id)}/end`, { body: input }),
    onSuccess: invalidate,
  });
}
