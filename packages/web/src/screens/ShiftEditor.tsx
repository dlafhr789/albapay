import { useState } from 'react';
import {
  paidMinutes,
  toClockTime,
  toShiftTimes,
  wageOn,
  type ClockRange,
  type LocalDate,
  type ShiftKind,
  type ShiftRecord,
  type ShiftStatus,
  type WageEntry,
} from '@albapay/shared';
import { useCreateShift, useDeleteShift, useUpdateShift } from '../api/hooks';
import { formatMinutes, formatWon } from '../lib/format';
import { ErrorAlert, SectionGroup, Segmented } from '../ui/controls';

const STATUS_OPTIONS = [
  { value: 'SCHEDULED', label: '예정' },
  { value: 'WORKED', label: '근무함' },
  { value: 'ABSENT', label: '결근' },
  { value: 'CANCELLED', label: '빠진 날' },
] as const satisfies readonly { value: ShiftStatus; label: string }[];

const KIND_OPTIONS = [
  { value: 'REGULAR', label: '계약 근무' },
  { value: 'EXTRA', label: '대타 · 추가' },
] as const satisfies readonly { value: ShiftKind; label: string }[];

const DEFAULT_RANGE: ClockRange = { start: '18:00', end: '23:00', breakMin: 0 };

function plannedOf(shift: ShiftRecord): ClockRange {
  return { start: toClockTime(shift.plannedStart), end: toClockTime(shift.plannedEnd), breakMin: shift.plannedBreakMin };
}

function actualOf(shift: ShiftRecord): ClockRange | null {
  if (!shift.actualStart || !shift.actualEnd) return null;
  return { start: toClockTime(shift.actualStart), end: toClockTime(shift.actualEnd), breakMin: shift.actualBreakMin ?? 0 };
}

/** 입력 중인 값으로 이 근무의 급여를 미리 계산한다. 값이 아직 맞지 않으면 null */
function estimate(
  workDate: LocalDate,
  status: ShiftStatus,
  planned: ClockRange,
  actual: ClockRange | null,
  wages: readonly WageEntry[],
): { minutes: number; wage: number; pay: number } | null {
  try {
    const times = toShiftTimes({ workDate, planned, actual: status === 'WORKED' ? actual : null });
    const minutes = paidMinutes({ id: 'preview', workDate, kind: 'EXTRA', status, ...times });
    const wage = wageOn(wages, workDate);
    return { minutes, wage, pay: Math.floor((minutes * wage) / 60) };
  } catch {
    return null;
  }
}

interface ShiftEditorProps {
  date: LocalDate;
  /** null이면 새 근무 */
  shift: ShiftRecord | null;
  wages: readonly WageEntry[];
  onSaved: (shift: ShiftRecord) => void;
  onDeleted: () => void;
}

/**
 * 근무 하나를 추가하거나 고친다. 수정은 서버에서 전체 교체라 모든 필드를 보낸다.
 * 상태가 '근무함'이면 시간 칸은 실제 시각을 고치고, 나머지 상태에서는 예정 시각을 고친다.
 */
export function ShiftEditor({ date, shift, wages, onSaved, onDeleted }: ShiftEditorProps) {
  const [workDate, setWorkDate] = useState<LocalDate>(shift?.workDate ?? date);
  const [status, setStatus] = useState<ShiftStatus>(shift?.status ?? 'SCHEDULED');
  const [kind, setKind] = useState<ShiftKind>(shift?.kind ?? 'EXTRA');
  const [planned, setPlanned] = useState<ClockRange>(shift ? plannedOf(shift) : DEFAULT_RANGE);
  const [actual, setActual] = useState<ClockRange | null>(shift ? actualOf(shift) : null);
  const [memo, setMemo] = useState(shift?.memo ?? '');

  const create = useCreateShift();
  const update = useUpdateShift();
  const remove = useDeleteShift();
  const pending = create.isPending || update.isPending || remove.isPending;
  const error = create.error ?? update.error ?? remove.error;

  const fromRule = shift?.ruleId != null;
  const editingActual = status === 'WORKED';
  const range = editingActual ? (actual ?? planned) : planned;

  function changeStatus(next: ShiftStatus) {
    setStatus(next);
    // 근무함으로 바꾸면 실제 시각을 예정 시각으로 채워 두고, 다른 부분만 고치게 한다.
    if (next === 'WORKED' && !actual) setActual(planned);
  }

  function changeRange(patch: Partial<ClockRange>) {
    if (editingActual) setActual({ ...range, ...patch });
    else setPlanned({ ...planned, ...patch });
  }

  function save() {
    const body = {
      workDate,
      kind,
      status,
      planned,
      actual: status === 'WORKED' ? (actual ?? planned) : null,
      memo: memo.trim() === '' ? null : memo.trim(),
    };
    if (shift) update.mutate({ current: shift, input: { ...body, version: shift.version } }, { onSuccess: onSaved });
    else create.mutate(body, { onSuccess: onSaved });
  }

  const preview = estimate(workDate, status, planned, actual, wages);
  const statusOptions = shift ? STATUS_OPTIONS : STATUS_OPTIONS.filter((option) => option.value !== 'CANCELLED');

  return (
    <form
      className="editor"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <Segmented label="근무 상태" value={status} options={statusOptions} onChange={changeStatus} />

      <SectionGroup title={editingActual ? '실제 시간' : '시간'}>
        <section className="section">
          <label className="row">
            <span>날짜</span>
            <input
              className="field-input"
              type="date"
              required
              value={workDate}
              onChange={(event) => event.target.value && setWorkDate(event.target.value)}
            />
          </label>
          <label className="row">
            <span>출근</span>
            <span className="row-value">
              {editingActual && <span className="row-sub">예정 {planned.start}</span>}
              <input
                className={`field-input${editingActual && range.start !== planned.start ? ' field-input--accent' : ''}`}
                type="time"
                required
                value={range.start}
                onChange={(event) => changeRange({ start: event.target.value })}
              />
            </span>
          </label>
          <label className="row">
            <span>퇴근</span>
            <span className="row-value">
              {editingActual && <span className="row-sub">예정 {planned.end}</span>}
              <input
                className={`field-input${editingActual && range.end !== planned.end ? ' field-input--accent' : ''}`}
                type="time"
                required
                value={range.end}
                onChange={(event) => changeRange({ end: event.target.value })}
              />
            </span>
          </label>
          <label className="row">
            <span>무급 휴게</span>
            <span className="row-value">
              <input
                className="field-input"
                type="number"
                inputMode="numeric"
                min={0}
                step={5}
                value={range.breakMin}
                onChange={(event) => changeRange({ breakMin: Math.max(0, Math.round(Number(event.target.value) || 0)) })}
              />
              <span>분</span>
            </span>
          </label>
        </section>
      </SectionGroup>

      <SectionGroup title="구분" hint="주휴수당은 계약 근무의 예정 시간으로만 계산해요.">
        <Segmented label="근무 구분" value={kind} options={KIND_OPTIONS} onChange={setKind} />
      </SectionGroup>

      <div className="section-group">
        <label htmlFor={`memo-${shift?.id ?? 'new'}`} className="section-title">
          메모
        </label>
        <input
          id={`memo-${shift?.id ?? 'new'}`}
          className="text-input"
          type="text"
          maxLength={200}
          placeholder="없음"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
        />
      </div>

      <ErrorAlert error={error} />

      {shift && !fromRule && (
        <button type="button" className="button button--danger button--block" disabled={pending} onClick={() => remove.mutate(shift, { onSuccess: onDeleted })}>
          근무 삭제
        </button>
      )}

      <div className="footer-bar">
        <div className="footer-bar-inner">
          <div className="footer-summary">
            <div className="row-sub">{preview ? `${formatMinutes(preview.minutes)} · 시급 ${formatWon(preview.wage)}` : '시급 이력이 없어 계산할 수 없어요'}</div>
            <div className="footer-amount">{preview ? formatWon(preview.pay) : '—'}</div>
          </div>
          <button type="submit" className="button" disabled={pending}>
            {shift ? (fromRule ? '이 날만 저장' : '저장') : '추가'}
          </button>
        </div>
      </div>
    </form>
  );
}
