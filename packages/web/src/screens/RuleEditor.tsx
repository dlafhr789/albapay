import { useState } from 'react';
import { addDays, todayInSeoul, type DayOfWeek, type LocalDate, type RuleRecord, type RuleSlot } from '@albapay/shared';
import { useCreateRule, useEndRule, useRules, useSplitRule } from '../api/hooks';
import { formatMinutes, formatMonthDay, weekdayName } from '../lib/format';
import { navigate } from '../lib/router';
import { WEEK_ORDER, weeklyMinutes } from '../lib/rules';
import { BackLink, ErrorAlert, Loading, SectionGroup, Segmented } from '../ui/controls';
import { InfoIcon } from '../ui/icons';

const INTERVAL_OPTIONS = [
  { value: '1', label: '매주' },
  { value: '2', label: '격주' },
] as const;

/** 시안처럼 모든 요일에 같은 시각을 쓴다. 요일마다 다른 규칙을 열면 첫 요일의 시각으로 채운다. */
function initialTimes(rule: RuleRecord | undefined) {
  const first = rule?.slots[0];
  return first ? { start: first.start, end: first.end, breakMin: first.breakMin } : { start: '18:00', end: '23:00', breakMin: 0 };
}

export function RuleEditorScreen({ id }: { id: string | null }) {
  const rules = useRules();
  if (id === null) return <RuleEditor rule={undefined} />;
  if (rules.isPending) return <Loading />;
  const rule = rules.data?.find((candidate) => candidate.id === id);
  if (!rule) {
    return (
      <div className="page page--bare">
        <BackLink to="/rules">반복 근무</BackLink>
        <ErrorAlert error={rules.error ?? new Error()} />
        {!rules.error && <p className="empty">규칙을 찾을 수 없어요. 이미 끝났거나 바뀌었을 수 있어요.</p>}
      </div>
    );
  }
  return <RuleEditor rule={rule} />;
}

function RuleEditor({ rule }: { rule: RuleRecord | undefined }) {
  const today = todayInSeoul();
  const times = initialTimes(rule);
  const [days, setDays] = useState<Set<DayOfWeek>>(new Set(rule?.slots.map((slot) => slot.dayOfWeek) ?? []));
  const [start, setStart] = useState(times.start);
  const [end, setEnd] = useState(times.end);
  const [breakMin, setBreakMin] = useState(times.breakMin);
  const [interval, setIntervalChoice] = useState<'1' | '2'>(rule?.intervalWeeks === 2 ? '2' : '1');
  const [fromDate, setFromDate] = useState<LocalDate>(rule && rule.startDate > today ? rule.startDate : today);
  const [endDate, setEndDate] = useState<LocalDate | null>(rule?.endDate ?? null);

  const create = useCreateRule();
  const split = useSplitRule();
  const finish = useEndRule();
  const pending = create.isPending || split.isPending || finish.isPending;
  const error = create.error ?? split.error ?? finish.error;
  const differingSlots = rule ? new Set(rule.slots.map((slot) => `${slot.start}-${slot.end}-${slot.breakMin}`)).size > 1 : false;

  const slots: RuleSlot[] = WEEK_ORDER.filter((day) => days.has(day)).map((dayOfWeek) => ({ dayOfWeek, start, end, breakMin }));
  const intervalWeeks = interval === '2' ? 2 : 1;
  const weekly = slots.length && start !== end ? weeklyMinutes({ slots, intervalWeeks }) : 0;

  function toggle(day: DayOfWeek) {
    const next = new Set(days);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    setDays(next);
  }

  function done() {
    navigate('/rules');
  }

  function apply() {
    if (rule) split.mutate({ id: rule.id, input: { version: rule.version, fromDate, slots, endDate, intervalWeeks } }, { onSuccess: done });
    else create.mutate({ startDate: fromDate, slots, endDate, intervalWeeks }, { onSuccess: done });
  }

  return (
    <div className="page page--bare">
      <BackLink to="/rules">반복 근무</BackLink>
      <h1 className="page-title">{rule ? '규칙 바꾸기' : '새 규칙'}</h1>

      <SectionGroup title="요일">
        <div role="group" aria-label="근무 요일" className="day-picker">
          {WEEK_ORDER.map((day) => (
            <button key={day} type="button" aria-pressed={days.has(day)} onClick={() => toggle(day)}>
              {weekdayName(day)}
            </button>
          ))}
        </div>
      </SectionGroup>

      <SectionGroup title="시간" hint={differingSlots ? '요일마다 시각이 달랐던 규칙이에요. 적용하면 고른 요일이 모두 같은 시각이 돼요.' : undefined}>
        <section className="section">
          <label className="row">
            <span>시작</span>
            <input className="field-input" type="time" required value={start} onChange={(event) => setStart(event.target.value)} />
          </label>
          <label className="row">
            <span>종료</span>
            <input className="field-input" type="time" required value={end} onChange={(event) => setEnd(event.target.value)} />
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
                value={breakMin}
                onChange={(event) => setBreakMin(Math.max(0, Math.round(Number(event.target.value) || 0)))}
              />
              <span>분</span>
            </span>
          </label>
        </section>
      </SectionGroup>

      <SectionGroup title="반복" hint={interval === '2' ? '격주는 시작하는 날이 속한 주부터 한 주 걸러 근무해요.' : undefined}>
        <Segmented label="반복 간격" value={interval} options={INTERVAL_OPTIONS} onChange={setIntervalChoice} />
      </SectionGroup>

      <SectionGroup title="적용">
        <section className="section">
          <label className="row">
            <span>{rule ? '바뀌는 날' : '시작일'}</span>
            <input
              className="field-input"
              type="date"
              required
              value={fromDate}
              onChange={(event) => event.target.value && setFromDate(event.target.value)}
            />
          </label>
          <div className="row">
            <label htmlFor="rule-end">종료일</label>
            <span className="row-value">
              {endDate === null ? (
                <button type="button" className="field-input" onClick={() => setEndDate(addDays(fromDate, 27))}>
                  없음
                </button>
              ) : (
                <>
                  <input
                    id="rule-end"
                    className="field-input"
                    type="date"
                    min={fromDate}
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value || null)}
                  />
                  <button type="button" className="link-button" onClick={() => setEndDate(null)}>
                    없애기
                  </button>
                </>
              )}
            </span>
          </div>
        </section>
      </SectionGroup>

      {weekly > 0 && (
        <div className="note note--icon">
          <InfoIcon />
          <p>
            <strong>주 {formatMinutes(weekly)}</strong>
            {weekly >= 900 ? ' · 주휴수당 대상이에요' : ' · 주 15시간 미만이라 주휴수당 대상이 아니에요'}
          </p>
        </div>
      )}

      <ErrorAlert error={error} />

      {rule && (
        <button
          type="button"
          className="button button--danger button--block"
          disabled={pending}
          onClick={() => finish.mutate({ id: rule.id, input: { version: rule.version, fromDate } }, { onSuccess: done })}
        >
          {formatMonthDay(fromDate)}부터 이 규칙 끝내기
        </button>
      )}

      <div className="footer-bar">
        <div className="footer-bar-inner footer-bar-inner--stack">
          {rule && <p className="hint">{formatMonthDay(addDays(fromDate, -1))}까지의 근무와 따로 고친 근무는 바뀌지 않아요.</p>}
          <button type="button" className="button button--block" disabled={pending || slots.length === 0} onClick={apply}>
            {rule ? `${formatMonthDay(fromDate)}부터 적용` : '규칙 만들기'}
          </button>
        </div>
      </div>
    </div>
  );
}
