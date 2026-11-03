import { toClockTime, type LocalDate, type ShiftRecord } from '@albapay/shared';
import { monthOf, useConfig, useRules, useShifts } from '../api/hooks';
import { formatMonthDayWeekday } from '../lib/format';
import { ruleDaysLabel } from '../lib/rules';
import { ErrorAlert, Loading } from '../ui/controls';
import { CloseIcon, PlusIcon } from '../ui/icons';
import { ShiftEditor } from './ShiftEditor';

const STATUS_LABEL: Record<ShiftRecord['status'], string> = {
  SCHEDULED: '예정',
  WORKED: '근무함',
  ABSENT: '결근',
  CANCELLED: '빠진 날',
};

interface DayPanelProps {
  date: LocalDate;
  /** 고를 근무 ID. 'new'면 새 근무. 없으면 그날 첫 근무, 근무가 없으면 새 근무 */
  selected: string | null;
  onSelect: (selected: string) => void;
  onDone: () => void;
  onClose?: () => void;
}

/** 하루의 근무를 보여 주고 고친다. 휴대폰에서는 화면 하나, 컴퓨터에서는 달력 옆 패널로 쓴다. */
export function DayPanel({ date, selected, onSelect, onDone, onClose }: DayPanelProps) {
  const shifts = useShifts(monthOf(date));
  const config = useConfig();
  const rules = useRules();

  if (shifts.isPending || config.isPending) return <Loading />;
  if (shifts.error || config.error) return <ErrorAlert error={shifts.error ?? config.error} />;

  const dayShifts = shifts.data.filter((shift) => shift.workDate === date);
  const current = selected === 'new' ? null : (dayShifts.find((shift) => shift.id === selected) ?? dayShifts[0] ?? null);
  const rule = current?.ruleId ? rules.data?.find((candidate) => candidate.id === current.ruleId) : undefined;

  return (
    <div className="day-panel">
      <div className="day-panel-head">
        <div>
          <h1 className="day-title">{formatMonthDayWeekday(date)}</h1>
          <div className="day-badges">
            {current?.ruleId && <span className="badge">반복 근무{rule ? ` · ${ruleDaysLabel(rule)}` : ''}</span>}
            {current && !current.ruleId && <span className="badge">직접 추가</span>}
            {!current && <span className="badge">새 근무</span>}
          </div>
        </div>
        {onClose && (
          <button type="button" className="icon-button" aria-label="닫기" onClick={onClose}>
            <CloseIcon />
          </button>
        )}
      </div>

      {(dayShifts.length > 1 || (dayShifts.length > 0 && !current)) && (
        <div className="day-tabs" role="group" aria-label="이날의 근무">
          {dayShifts.map((shift) => (
            <button key={shift.id} type="button" aria-pressed={shift.id === current?.id} onClick={() => onSelect(shift.id)}>
              {toClockTime(shift.plannedStart)} · {STATUS_LABEL[shift.status]}
            </button>
          ))}
        </div>
      )}

      <ShiftEditor
        key={current ? `${current.id}:${current.version}` : `new:${date}`}
        date={date}
        shift={current}
        wages={config.data.wages}
        onSaved={onDone}
        onDeleted={onDone}
      />

      {current && (
        <button type="button" className="link-button day-add" onClick={() => onSelect('new')}>
          <PlusIcon size={16} /> 이날 근무 하나 더 추가
        </button>
      )}
    </div>
  );
}
