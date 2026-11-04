import { todayInSeoul, type RuleRecord } from '@albapay/shared';
import { useRules } from '../api/hooks';
import { formatFullDate, formatMinutes, weekdayName } from '../lib/format';
import { Link } from '../lib/router';
import { ruleDaysLabel, WEEK_ORDER, weeklyMinutes } from '../lib/rules';
import { ErrorAlert, Loading, SectionGroup } from '../ui/controls';
import { ChevronRight, InfoIcon, PlusIcon } from '../ui/icons';

function timesLabel(rule: RuleRecord): string {
  const ranges = new Set(rule.slots.map((slot) => `${slot.start} – ${slot.end}`));
  return ranges.size === 1 ? [...ranges][0]! : '요일마다 다름';
}

function breakLabel(rule: RuleRecord): string {
  const breaks = new Set(rule.slots.map((slot) => slot.breakMin));
  const only = breaks.size === 1 ? [...breaks][0]! : null;
  const breakText = only === null ? '휴게 요일마다 다름' : only === 0 ? '휴게 없음' : `휴게 ${only}분`;
  return `${breakText} · ${rule.intervalWeeks === 2 ? '격주' : '매주'}`;
}

function RuleCard({ rule }: { rule: RuleRecord }) {
  const days = new Set(rule.slots.map((slot) => slot.dayOfWeek));
  const label = `${ruleDaysLabel(rule)}, ${timesLabel(rule)}`;
  return (
    <Link to={`/rules/${encodeURIComponent(rule.id)}`} className="card rule-card" aria-label={`${label} 규칙 바꾸기`}>
      <div className="rule-card-head">
        <div className="weekdays" aria-hidden="true">
          {WEEK_ORDER.map((day) => (
            <span key={day} className={days.has(day) ? 'weekday weekday--on' : 'weekday'}>
              {weekdayName(day)}
            </span>
          ))}
        </div>
        <ChevronRight />
      </div>
      <div className="rule-card-time">{timesLabel(rule)}</div>
      <div className="row-sub">{breakLabel(rule)}</div>
      <div className="rule-card-foot">
        <span>
          {formatFullDate(rule.startDate)}부터 · {rule.endDate ? `${formatFullDate(rule.endDate)}까지` : '종료일 없음'}
        </span>
        <span className="badge">주 {formatMinutes(weeklyMinutes(rule))}</span>
      </div>
    </Link>
  );
}

export function Rules() {
  const rules = useRules();
  const today = todayInSeoul();
  const active = (rules.data ?? []).filter((rule) => rule.endDate === null || rule.endDate >= today);
  const past = (rules.data ?? []).filter((rule) => rule.endDate !== null && rule.endDate < today).reverse();

  return (
    <div className="page">
      <div>
        <h1 className="page-title">반복 근무</h1>
        <p className="page-lead">규칙대로 90일 앞까지 근무가 미리 채워져요.</p>
      </div>

      {rules.isPending && <Loading />}
      <ErrorAlert error={rules.error} />

      {rules.data && (
        <SectionGroup title="사용 중">
          {active.length === 0 && <p className="card empty">사용 중인 규칙이 없어요.</p>}
          {active.map((rule) => (
            <RuleCard key={rule.id} rule={rule} />
          ))}
        </SectionGroup>
      )}

      {past.length > 0 && (
        <SectionGroup title="지난 규칙">
          <section className="section">
            {past.map((rule) => (
              <div key={rule.id} className="row">
                <span className="row-label">
                  <span>
                    {ruleDaysLabel(rule)} · {timesLabel(rule)}
                  </span>
                  <span className="row-sub">
                    {formatFullDate(rule.startDate)} – {formatFullDate(rule.endDate!)}
                  </span>
                </span>
                <span className="badge">종료</span>
              </div>
            ))}
          </section>
        </SectionGroup>
      )}

      <Link to="/rules/new" className="button button--secondary button--block">
        <PlusIcon size={18} /> 새 규칙 추가
      </Link>

      <div className="note note--icon">
        <InfoIcon />
        <p>규칙을 바꾸면 고른 날짜부터 새 일정으로 바뀌어요. 지난 근무와 따로 고친 근무는 그대로 남아요.</p>
      </div>
    </div>
  );
}
