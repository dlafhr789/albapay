import { useRef, useState, type FormEvent } from 'react';
import {
  findEffective,
  RATES_2026,
  todayInSeoul,
  type AppSettings,
  type DayOfWeek,
  type DeductionInput,
  type DeductionProfile,
  type LocalDate,
  type WageEntry,
} from '@albapay/shared';
import { UNAUTHORIZED_EVENT } from '../api/client';
import { clearToken } from '../api/token';
import {
  useCalendarStatus,
  useConfig,
  useDeleteDeduction,
  useDisableCalendar,
  useDeleteWage,
  useIssueCalendarToken,
  usePutDeduction,
  usePutWage,
  useSaveSettings,
} from '../api/hooks';
import { formatFullDate, formatNumber, formatWon, weekdayName } from '../lib/format';
import { WEEK_ORDER } from '../lib/rules';
import { ErrorAlert, Loading, SectionGroup, Segmented, Toggle } from '../ui/controls';
import { CloseIcon, PlusIcon } from '../ui/icons';

const DAYS_1_TO_28 = Array.from({ length: 28 }, (_, index) => index + 1);

function defaultSettings(today: LocalDate): AppSettings {
  return {
    hireDate: today,
    periodStartDay: 1,
    payDay: 10,
    weekStartsOn: 1,
    weeklyHolidayMode: 'FOUR_WEEK_AVERAGE',
    eventTitle: '알바',
    showPayInEvent: false,
    eventTravelMin: 0,
    eventAlertMin: null,
  };
}

const TRAVEL_CHOICES = [0, 15, 30, 45, 60];
const ALERT_CHOICES = [10, 30, 60];

function minutesText(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60}시간`;
  return minutes > 60 ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분` : `${minutes}분`;
}

/** API로 목록에 없는 값을 저장했어도 화면이 그 값을 보여 주도록 선택지에 더한다. */
function withValue(choices: readonly number[], value: number | null): number[] {
  return value === null || choices.includes(value) ? [...choices] : [...choices, value].sort((a, b) => a - b);
}

/** 알림이 시작 몇 분 전에 울리는지. 이동 시간이 있으면 출발 시각 기준이라 그만큼 더 앞이다. */
function alertSub(travelMin: number, alertMin: number | null): string | null {
  if (alertMin === null) return null;
  const total = travelMin + alertMin;
  return total === 0 ? '근무 시작 시각에 울려요' : `근무 시작 ${minutesText(total)} 전에 울려요`;
}

function SettingsForm({ saved, today }: { saved: AppSettings | null; today: LocalDate }) {
  const [form, setForm] = useState<AppSettings>(saved ?? defaultSettings(today));
  const save = useSaveSettings();
  const dirty = saved === null || JSON.stringify(form) !== JSON.stringify(saved);

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setForm({ ...form, [key]: value });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate({ ...form, eventTitle: form.eventTitle.trim() || '알바' });
  }

  return (
    <form className="settings-form" onSubmit={submit}>
      <SectionGroup title="근무">
        <section className="section">
          <label className="row">
            <span>입사일</span>
            <input className="field-input" type="date" required value={form.hireDate} onChange={(event) => event.target.value && set('hireDate', event.target.value)} />
          </label>
          <label className="row">
            <span className="row-label">
              <span>정산 시작일</span>
              <span className="row-sub">이날부터 다음 달 전날까지가 한 기간</span>
            </span>
            <select className="field-input" value={form.periodStartDay} onChange={(event) => set('periodStartDay', Number(event.target.value))}>
              {DAYS_1_TO_28.map((day) => (
                <option key={day} value={day}>
                  매월 {day}일
                </option>
              ))}
            </select>
          </label>
          <label className="row">
            <span>급여일</span>
            <select className="field-input" value={form.payDay} onChange={(event) => set('payDay', Number(event.target.value))}>
              {DAYS_1_TO_28.map((day) => (
                <option key={day} value={day}>
                  다음 달 {day}일
                </option>
              ))}
            </select>
          </label>
          <label className="row">
            <span className="row-label">
              <span>주 시작 요일</span>
              <span className="row-sub">주휴수당을 세는 주</span>
            </span>
            <select className="field-input" value={form.weekStartsOn} onChange={(event) => set('weekStartsOn', Number(event.target.value) as DayOfWeek)}>
              {WEEK_ORDER.map((day) => (
                <option key={day} value={day}>
                  {weekdayName(day)}요일
                </option>
              ))}
            </select>
          </label>
          <label className="row">
            <span className="row-label">
              <span>주휴수당 판정</span>
              <span className="row-sub">근무 시간이 주마다 다르면 4주 평균</span>
            </span>
            <select
              className="field-input"
              value={form.weeklyHolidayMode}
              onChange={(event) => set('weeklyHolidayMode', event.target.value as AppSettings['weeklyHolidayMode'])}
            >
              <option value="FOUR_WEEK_AVERAGE">4주 평균</option>
              <option value="SINGLE_WEEK">그 주만</option>
            </select>
          </label>
        </section>
      </SectionGroup>

      <SectionGroup title="애플 캘린더" hint="저장하면 캘린더 앱이 다음에 일정을 받아 갈 때 바뀌어요. 예상 급여는 기본급만 계산해요. 알림이 울리지 않으면 아이폰 설정의 구독 캘린더에서 '알림 제거'를 꺼 주세요.">
        <section className="section">
          <label className="row">
            <span>일정 제목</span>
            <input className="field-input field-input--text" type="text" maxLength={40} value={form.eventTitle} onChange={(event) => set('eventTitle', event.target.value)} />
          </label>
          <div className="row">
            <span>일정에 예상 급여 표시</span>
            <Toggle label="일정에 예상 급여 표시" checked={form.showPayInEvent} onChange={(checked) => set('showPayInEvent', checked)} />
          </div>
          <label className="row">
            <span className="row-label">
              <span>이동 시간</span>
              <span className="row-sub">일정 앞에 이동 시간이 붙어요</span>
            </span>
            <select className="field-input" value={form.eventTravelMin} onChange={(event) => set('eventTravelMin', Number(event.target.value))}>
              {withValue(TRAVEL_CHOICES, form.eventTravelMin).map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes === 0 ? '없음' : minutesText(minutes)}
                </option>
              ))}
            </select>
          </label>
          <label className="row">
            <span className="row-label">
              <span>알림</span>
              {alertSub(form.eventTravelMin, form.eventAlertMin) && <span className="row-sub">{alertSub(form.eventTravelMin, form.eventAlertMin)}</span>}
            </span>
            <select
              className="field-input"
              value={form.eventAlertMin ?? ''}
              onChange={(event) => set('eventAlertMin', event.target.value === '' ? null : Number(event.target.value))}
            >
              <option value="">없음</option>
              {withValue(ALERT_CHOICES, form.eventAlertMin).map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes === 0 ? '출발할 때' : `출발 ${minutesText(minutes)} 전`}
                </option>
              ))}
            </select>
          </label>
        </section>
      </SectionGroup>

      <ErrorAlert error={save.error} />
      {save.isSuccess && !dirty && <p className="hint">저장했어요.</p>}
      {dirty && (
        <button type="submit" className="button button--block" disabled={save.isPending}>
          {saved ? '설정 저장' : '설정 저장하고 시작하기'}
        </button>
      )}
    </form>
  );
}

type CalendarConfirm = 'reissue' | 'disable';

const CONFIRM_TEXT: Record<CalendarConfirm, { message: string; action: string }> = {
  reissue: {
    message: '지금 캘린더에 등록한 주소는 바로 끊겨요. 새 주소를 캘린더에 다시 추가해야 해요.',
    action: '새로 만들기',
  },
  disable: {
    message: '캘린더에는 마지막으로 받아 간 일정이 남을 수 있어요. 아이폰 캘린더 설정에서 구독도 지워 주세요.',
    action: '구독 끊기',
  },
};

/** 구독 주소를 만들고 끊는다. 원본 토큰은 서버에 없어서, 만든 직후 이 화면에서만 주소를 보여 준다. */
function CalendarSubscription() {
  const status = useCalendarStatus();
  const issue = useIssueCalendarToken();
  const disable = useDisableCalendar();
  const [feedToken, setFeedToken] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<CalendarConfirm | null>(null);
  const [copied, setCopied] = useState(false);
  const urlRef = useRef<HTMLElement>(null);

  const feedUrl = feedToken ? `${window.location.origin}/cal/${feedToken}.ics` : null;
  const busy = issue.isPending || disable.isPending;

  function create() {
    setConfirm(null);
    setCopied(false);
    issue.mutate(undefined, { onSuccess: (data) => setFeedToken(data.token) });
  }

  function turnOff() {
    setConfirm(null);
    disable.mutate(undefined, { onSuccess: () => setFeedToken(null) });
  }

  async function copy() {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
    } catch {
      // 클립보드를 쓸 수 없으면 주소를 선택해 두어서 직접 복사하게 한다.
      const node = urlRef.current;
      if (node) window.getSelection()?.selectAllChildren(node);
    }
  }

  const enabled = status.data?.enabled ?? false;
  const createdAt = status.data?.createdAt;

  return (
    <SectionGroup
      title="캘린더 구독"
      hint={
        feedUrl
          ? '이 주소는 지금 한 번만 보여요. 주소를 아는 사람은 누구나 근무 일정을 볼 수 있으니 다른 사람에게 보여 주지 마세요.'
          : '구독 주소를 아이폰 캘린더에 추가하면, 캘린더 앱이 입사일부터 앞으로 120일까지의 근무를 주기적으로 받아 가요. 지난 근무도 캘린더에 계속 남아요.'
      }
    >
      <section className="section">
        {status.isPending && (
          <div className="row">
            <span className="row-muted">불러오는 중…</span>
          </div>
        )}
        {status.data && (
          <div className="row">
            <span className="row-label">
              <span>구독 주소</span>
              {enabled && createdAt && <span className="row-sub">{formatFullDate(todayInSeoul(new Date(createdAt)))}에 만듦</span>}
            </span>
            <span className={enabled ? 'badge badge--primary' : 'badge'}>{enabled ? '켜짐' : '꺼짐'}</span>
          </div>
        )}

        {feedUrl && (
          <div className="row row--block feed">
            <code ref={urlRef} className="feed-url">
              {feedUrl}
            </code>
            <div className="feed-actions">
              <a className="button button--small" href={feedUrl.replace(/^https?:/, 'webcal:')}>
                캘린더에 추가
              </a>
              <button type="button" className="button button--small button--secondary" onClick={copy}>
                {copied ? '복사했어요' : '주소 복사'}
              </button>
            </div>
          </div>
        )}

        {status.data && !enabled && (
          <button type="button" className="row row-button row-add" disabled={busy} onClick={create}>
            {issue.isPending ? '만드는 중…' : '구독 주소 만들기'}
          </button>
        )}

        {enabled && confirm === null && (
          <>
            <button type="button" className="row row-button" disabled={busy} onClick={() => setConfirm('reissue')}>
              {issue.isPending ? '만드는 중…' : '주소 새로 만들기'}
            </button>
            <button type="button" className="row row-button row-button--danger" disabled={busy} onClick={() => setConfirm('disable')}>
              {disable.isPending ? '끊는 중…' : '구독 끊기'}
            </button>
          </>
        )}

        {enabled && confirm && (
          <div className="row row--block feed">
            <p className="note">{CONFIRM_TEXT[confirm].message}</p>
            <div className="feed-actions">
              <button type="button" className="button button--small button--secondary" onClick={() => setConfirm(null)}>
                취소
              </button>
              <button
                type="button"
                className={confirm === 'disable' ? 'button button--small button--danger' : 'button button--small'}
                onClick={confirm === 'disable' ? turnOff : create}
              >
                {CONFIRM_TEXT[confirm].action}
              </button>
            </div>
          </div>
        )}
      </section>
      <ErrorAlert error={status.error ?? issue.error ?? disable.error} />
    </SectionGroup>
  );
}

function historyBadge(effectiveFrom: LocalDate, current: { effectiveFrom: LocalDate } | undefined, today: LocalDate) {
  if (effectiveFrom > today) return <span className="badge">예정</span>;
  if (current?.effectiveFrom === effectiveFrom) return <span className="badge badge--primary">적용 중</span>;
  return <span className="badge">지난 값</span>;
}

function Wages({ wages, today }: { wages: readonly WageEntry[]; today: LocalDate }) {
  const [adding, setAdding] = useState(wages.length === 0);
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [hourlyWage, setHourlyWage] = useState('');
  const put = usePutWage();
  const remove = useDeleteWage();
  const current = findEffective(wages, today);
  const sorted = [...wages].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(hourlyWage.replaceAll(',', ''));
    if (!Number.isInteger(value) || value <= 0) return;
    put.mutate({ effectiveFrom, hourlyWage: value }, { onSuccess: () => { setAdding(false); setHourlyWage(''); } });
  }

  return (
    <SectionGroup title="시급" hint="시급은 덮어쓰지 않고 적용 시작일마다 쌓여요. 최저임금이 바뀌는 1월 1일 전후 근무가 각자 맞는 시급으로 계산돼요.">
      <section className="section">
        {sorted.map((wage) => (
          <div key={wage.effectiveFrom} className="row">
            <span className="row-label">
              <span className="row-strong">{formatWon(wage.hourlyWage)}</span>
              <span className="row-sub">{formatFullDate(wage.effectiveFrom)}부터</span>
            </span>
            <span className="row-value">
              {historyBadge(wage.effectiveFrom, current, today)}
              <button type="button" className="icon-button icon-button--small" aria-label={`${formatFullDate(wage.effectiveFrom)} 시급 지우기`} onClick={() => remove.mutate(wage.effectiveFrom)}>
                <CloseIcon size={16} />
              </button>
            </span>
          </div>
        ))}
        {adding ? (
          <form className="inline-form" onSubmit={submit}>
            <label className="row">
              <span>적용 시작일</span>
              <input className="field-input" type="date" required value={effectiveFrom} onChange={(event) => event.target.value && setEffectiveFrom(event.target.value)} />
            </label>
            <label className="row">
              <span>시급</span>
              <span className="row-value">
                <input className="field-input field-input--wide" type="text" inputMode="numeric" placeholder="10,320" required value={hourlyWage} onChange={(event) => setHourlyWage(event.target.value)} />
                <span>원</span>
              </span>
            </label>
            <div className="row row--actions">
              {wages.length > 0 && (
                <button type="button" className="button button--secondary button--small" onClick={() => setAdding(false)}>
                  취소
                </button>
              )}
              <button type="submit" className="button button--small" disabled={put.isPending}>
                시급 저장
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="row row-button" onClick={() => setAdding(true)}>
            <span className="row-add">
              <PlusIcon size={16} /> 시급 변경 추가
            </span>
          </button>
        )}
      </section>
      <ErrorAlert error={put.error ?? remove.error} />
    </SectionGroup>
  );
}

function percentText(ppm: number): string {
  return formatNumber(ppm / 10_000);
}

function describeDeduction(profile: DeductionProfile): { title: string; sub: string } {
  if (profile.type === 'NONE') return { title: '공제 없음', sub: '세금과 보험료를 빼지 않아요' };
  if (profile.type === 'WITHHOLDING') {
    const local = (profile.businessIncomeTaxPpm * profile.localIncomeTaxPpm) / 1_000_000;
    return {
      title: `${percentText(profile.businessIncomeTaxPpm + local)}% 원천징수`,
      sub: `사업소득세 ${percentText(profile.businessIncomeTaxPpm)}% + 지방소득세 ${percentText(local)}%`,
    };
  }
  const items = [
    profile.nationalPensionPpm !== null && `국민연금 ${percentText(profile.nationalPensionPpm)}%`,
    profile.healthInsurancePpm !== null && `건강보험 ${percentText(profile.healthInsurancePpm)}%`,
    profile.longTermCarePpm !== null && profile.healthInsurancePpm !== null && '장기요양',
    profile.employmentInsurancePpm !== null && `고용보험 ${percentText(profile.employmentInsurancePpm)}%`,
    profile.earnedIncomeTax > 0 && `근로소득세 ${formatWon(profile.earnedIncomeTax)}`,
  ].filter(Boolean);
  return { title: '4대보험', sub: items.join(' · ') || '내는 항목 없음' };
}

type InsuranceKey = 'nationalPensionPpm' | 'healthInsurancePpm' | 'longTermCarePpm' | 'employmentInsurancePpm';

const INSURANCE_ITEMS: readonly { key: InsuranceKey; label: string; sub?: string }[] = [
  { key: 'nationalPensionPpm', label: '국민연금' },
  { key: 'healthInsurancePpm', label: '건강보험' },
  { key: 'longTermCarePpm', label: '장기요양보험', sub: '건강보험료에 곱하는 비율' },
  { key: 'employmentInsurancePpm', label: '고용보험' },
];

function toPpm(text: string): number | null {
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value * 10_000) : null;
}

function DeductionForm({ today, onDone }: { today: LocalDate; onDone: () => void }) {
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [type, setType] = useState<DeductionInput['type']>('WITHHOLDING');
  const [enabled, setEnabled] = useState<Record<InsuranceKey, boolean>>({
    nationalPensionPpm: true,
    healthInsurancePpm: true,
    longTermCarePpm: true,
    employmentInsurancePpm: true,
  });
  const [rates, setRates] = useState<Record<InsuranceKey, string>>({
    nationalPensionPpm: percentText(RATES_2026.nationalPensionPpm),
    healthInsurancePpm: percentText(RATES_2026.healthInsurancePpm),
    longTermCarePpm: percentText(RATES_2026.longTermCarePpm),
    employmentInsurancePpm: percentText(RATES_2026.employmentInsurancePpm),
  });
  const [earnedIncomeTax, setEarnedIncomeTax] = useState('0');
  const put = usePutDeduction();

  function input(): DeductionInput | null {
    if (type === 'NONE') return { type };
    if (type === 'WITHHOLDING') {
      return { type, businessIncomeTaxPpm: RATES_2026.businessIncomeTaxPpm, localIncomeTaxPpm: RATES_2026.localIncomeTaxPpm };
    }
    const ppm = (key: InsuranceKey) => (enabled[key] ? toPpm(rates[key]) : null);
    const values = INSURANCE_ITEMS.map(({ key }) => [key, ppm(key)] as const);
    if (values.some(([key, value]) => enabled[key] && value === null)) return null;
    return {
      type,
      nationalPensionPpm: ppm('nationalPensionPpm'),
      healthInsurancePpm: ppm('healthInsurancePpm'),
      longTermCarePpm: ppm('longTermCarePpm'),
      employmentInsurancePpm: ppm('employmentInsurancePpm'),
      earnedIncomeTax: Math.max(0, Math.round(Number(earnedIncomeTax.replaceAll(',', '')) || 0)),
    };
  }

  const body = input();

  return (
    <form
      className="inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (body) put.mutate({ effectiveFrom, input: body }, { onSuccess: onDone });
      }}
    >
      <label className="row">
        <span>적용 시작일</span>
        <input className="field-input" type="date" required value={effectiveFrom} onChange={(event) => event.target.value && setEffectiveFrom(event.target.value)} />
      </label>
      <div className="row row--block">
        <Segmented
          label="공제 방식"
          value={type}
          options={[
            { value: 'WITHHOLDING', label: '3.3%' },
            { value: 'SOCIAL_INSURANCE', label: '4대보험' },
            { value: 'NONE', label: '없음' },
          ]}
          onChange={setType}
        />
      </div>
      {type === 'SOCIAL_INSURANCE' && (
        <>
          {INSURANCE_ITEMS.map(({ key, label, sub }) => (
            <div key={key} className="row">
              <span className="row-label">
                <span>{label}</span>
                {sub && <span className="row-sub">{sub}</span>}
              </span>
              <span className="row-value">
                {enabled[key] && (
                  <>
                    <input
                      className="field-input field-input--rate"
                      type="text"
                      inputMode="decimal"
                      aria-label={`${label} 요율`}
                      value={rates[key]}
                      onChange={(event) => setRates({ ...rates, [key]: event.target.value })}
                    />
                    <span>%</span>
                  </>
                )}
                <Toggle label={`${label} 냄`} checked={enabled[key]} onChange={(checked) => setEnabled({ ...enabled, [key]: checked })} />
              </span>
            </div>
          ))}
          <label className="row">
            <span className="row-label">
              <span>근로소득세</span>
              <span className="row-sub">간이세액표 금액. 지방소득세는 10%가 더해져요</span>
            </span>
            <span className="row-value">
              <input className="field-input field-input--wide" type="text" inputMode="numeric" value={earnedIncomeTax} onChange={(event) => setEarnedIncomeTax(event.target.value)} />
              <span>원</span>
            </span>
          </label>
        </>
      )}
      <ErrorAlert error={put.error} />
      <div className="row row--actions">
        <button type="button" className="button button--secondary button--small" onClick={onDone}>
          취소
        </button>
        <button type="submit" className="button button--small" disabled={!body || put.isPending}>
          공제 저장
        </button>
      </div>
    </form>
  );
}

function Deductions({ deductions, today }: { deductions: readonly DeductionProfile[]; today: LocalDate }) {
  const [adding, setAdding] = useState(false);
  const remove = useDeleteDeduction();
  const current = findEffective(deductions, today);
  const sorted = [...deductions].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

  return (
    <SectionGroup title="공제" hint="4대보험 요율의 기본값은 2026년 근로자 부담분이에요. 급여 명세서와 다르면 명세서 값으로 고쳐 주세요.">
      <section className="section">
        {sorted.length === 0 && !adding && <p className="empty">공제 이력이 없어서 공제 없이 계산해요.</p>}
        {sorted.map((profile) => {
          const { title, sub } = describeDeduction(profile);
          return (
            <div key={profile.effectiveFrom} className="row">
              <span className="row-label">
                <span className="row-strong">{title}</span>
                <span className="row-sub">
                  {formatFullDate(profile.effectiveFrom)}부터 · {sub}
                </span>
              </span>
              <span className="row-value">
                {historyBadge(profile.effectiveFrom, current, today)}
                <button type="button" className="icon-button icon-button--small" aria-label={`${formatFullDate(profile.effectiveFrom)} 공제 지우기`} onClick={() => remove.mutate(profile.effectiveFrom)}>
                  <CloseIcon size={16} />
                </button>
              </span>
            </div>
          );
        })}
        {adding ? (
          <DeductionForm today={today} onDone={() => setAdding(false)} />
        ) : (
          <button type="button" className="row row-button" onClick={() => setAdding(true)}>
            <span className="row-add">
              <PlusIcon size={16} /> 공제 방식 추가
            </span>
          </button>
        )}
      </section>
      <ErrorAlert error={remove.error} />
    </SectionGroup>
  );
}

export function Settings() {
  const config = useConfig();
  const today = todayInSeoul();

  return (
    <div className="page">
      <h1 className="page-title">설정</h1>
      {config.isPending && <Loading />}
      <ErrorAlert error={config.error} />
      {config.data && (
        <>
          {!config.data.settings && <p className="alert alert--info">처음이라면 근무 설정과 시급을 저장해 주세요. 그래야 급여를 계산할 수 있어요.</p>}
          <SettingsForm key={JSON.stringify(config.data.settings)} saved={config.data.settings} today={today} />
          {config.data.settings && <CalendarSubscription />}
          <Wages wages={config.data.wages} today={today} />
          <Deductions deductions={config.data.deductions} today={today} />
        </>
      )}

      <SectionGroup title="이 기기" hint="토큰은 이 기기에만 저장돼 있어요. 지우면 다시 입력해야 해요.">
        <section className="section">
          <button
            type="button"
            className="row row-button row-button--danger"
            onClick={() => {
              clearToken();
              window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
            }}
          >
            토큰 지우고 다시 입력
          </button>
        </section>
      </SectionGroup>
    </div>
  );
}
