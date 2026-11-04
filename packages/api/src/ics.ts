import { paidMinutes, wageOn, type ShiftRecord, type WageEntry } from '@albapay/shared';

// 근무를 iCalendar(RFC 5545)로 바꾼다. 애플 캘린더가 구독 주소로 주기적으로 받아 간다.
// 캘린더 쪽은 읽기 전용이라, 피드에 없는 일정은 캘린더 앱이 지운다. 그래서 빠진 날과 결근은 넣지 않는다.

const CRLF = '\r\n';
/** RFC 5545 3.1: 한 줄은 줄바꿈을 빼고 75바이트를 넘지 않는다. */
const MAX_LINE_OCTETS = 75;
const encoder = new TextEncoder();

/** TEXT 값의 백슬래시, 세미콜론, 쉼표, 줄바꿈을 이스케이프한다(RFC 5545 3.3.11). */
export function escapeText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll(/\r?\n/g, '\\n');
}

/**
 * 75바이트가 넘는 줄을 접는다. 이어지는 줄은 공백 하나로 시작한다.
 * 한글은 UTF-8로 3바이트라 글자 중간에서 자르지 않도록 글자 단위로 센다.
 */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // 이어지는 줄은 앞의 공백 1바이트까지 75바이트 안에 들어야 한다.
    const limit = parts.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

/** `2026-11-04T18:00` → `20261104T180000` */
function localDateTime(value: string): string {
  return `${value.replaceAll('-', '').replace(':', '')}00`;
}

/** ISO 8601 UTC 시각 → `20261104T090000Z` */
function utcDateTime(iso: string): string {
  return `${iso.slice(0, 19).replaceAll('-', '').replaceAll(':', '')}Z`;
}

/** 서울은 일광 절약 시간이 없어서 표준시 하나로 정의한다. */
const SEOUL_TIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Asia/Seoul',
  'BEGIN:STANDARD',
  'DTSTART:19700101T000000',
  'TZOFFSETFROM:+0900',
  'TZOFFSETTO:+0900',
  'TZNAME:KST',
  'END:STANDARD',
  'END:VTIMEZONE',
];

export interface CalendarFeedOptions {
  /** 일정 제목. 설정의 eventTitle */
  title: string;
  /** 일정 설명에 그 근무의 예상 급여를 넣을지 */
  showPay: boolean;
  wages: readonly WageEntry[];
}

function payLine(shift: ShiftRecord, wages: readonly WageEntry[]): string | null {
  try {
    const minutes = paidMinutes(shift);
    const pay = Math.floor((minutes * wageOn(wages, shift.workDate)) / 60);
    const hours = minutes % 60 === 0 ? `${minutes / 60}시간` : `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
    return `${hours} · 예상 급여 ${new Intl.NumberFormat('ko-KR').format(pay)}원`;
  } catch {
    return null;
  }
}

function eventLines(shift: ShiftRecord, options: CalendarFeedOptions): string[] {
  // 실제 시각을 적었으면 실제 시각으로, 아니면 예정 시각으로 보인다.
  const start = shift.actualStart ?? shift.plannedStart;
  const end = shift.actualEnd ?? shift.plannedEnd;
  const summary = shift.kind === 'EXTRA' ? `${options.title} (대타)` : options.title;
  const description = [options.showPay ? payLine(shift, options.wages) : null, shift.memo]
    .filter((line): line is string => Boolean(line))
    .join('\n');

  return [
    'BEGIN:VEVENT',
    // 근무 ID가 바뀌지 않아서, 시각을 고치면 캘린더 앱이 같은 일정을 고친다.
    `UID:${shift.id}@albapay`,
    `DTSTAMP:${utcDateTime(shift.updatedAt)}`,
    `LAST-MODIFIED:${utcDateTime(shift.updatedAt)}`,
    `SEQUENCE:${shift.version}`,
    `DTSTART;TZID=Asia/Seoul:${localDateTime(start)}`,
    `DTEND;TZID=Asia/Seoul:${localDateTime(end)}`,
    `SUMMARY:${escapeText(summary)}`,
    ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
    'END:VEVENT',
  ];
}

/** 근무 목록을 .ics 본문으로 만든다. 빠진 날과 결근은 넣지 않는다. */
export function buildCalendarFeed(shifts: readonly ShiftRecord[], options: CalendarFeedOptions): string {
  const events = shifts
    .filter((shift) => shift.status !== 'CANCELLED' && shift.status !== 'ABSENT')
    .flatMap((shift) => eventLines(shift, options));

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//albapay//shifts//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(options.title)}`,
    'X-WR-TIMEZONE:Asia/Seoul',
    // 다시 받아 갈 간격 힌트. 실제 간격은 캘린더 앱 설정이 정한다.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...SEOUL_TIMEZONE,
    ...events,
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}
