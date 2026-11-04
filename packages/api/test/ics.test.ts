import { describe, expect, it } from 'vitest';
import type { ShiftRecord } from '@albapay/shared';
import { buildCalendarFeed, escapeText, foldLine } from '../src/ics';

const encoder = new TextEncoder();
const WAGES = [{ effectiveFrom: '2026-01-01', hourlyWage: 10_320 }];

function shift(overrides: Partial<ShiftRecord> = {}): ShiftRecord {
  return {
    id: 'r_RULE_20261104',
    workDate: '2026-11-04',
    ruleId: 'RULE',
    kind: 'REGULAR',
    status: 'SCHEDULED',
    plannedStart: '2026-11-04T18:00',
    plannedEnd: '2026-11-04T23:00',
    plannedBreakMin: 0,
    actualStart: null,
    actualEnd: null,
    actualBreakMin: null,
    detached: false,
    memo: null,
    version: 2,
    updatedAt: '2026-11-02T03:04:05.678Z',
    ...overrides,
  };
}

function unfold(feed: string): string[] {
  return feed.replaceAll('\r\n ', '').split('\r\n');
}

describe('escapeText', () => {
  it('escapes the characters RFC 5545 reserves in text', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });
});

describe('foldLine', () => {
  it('keeps every line within 75 octets without splitting a Korean character', () => {
    const line = `DESCRIPTION:${'오픈 인원이 없어서 한 시간 일찍 출근했다. '.repeat(4)}`;
    const folded = foldLine(line);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((part) => part.startsWith(' '))).toBe(true);
    expect(folded.replaceAll('\r\n ', '')).toBe(line);
  });

  it('leaves short lines alone', () => {
    expect(foldLine('SUMMARY:알바')).toBe('SUMMARY:알바');
  });
});

describe('buildCalendarFeed', () => {
  const options = { title: '알바', showPay: true, wages: WAGES };

  it('writes one event per shift in Seoul time with a stable UID', () => {
    const lines = unfold(buildCalendarFeed([shift()], options));
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('TZID:Asia/Seoul');
    expect(lines).toContain('UID:r_RULE_20261104@albapay');
    expect(lines).toContain('DTSTART;TZID=Asia/Seoul:20261104T180000');
    expect(lines).toContain('DTEND;TZID=Asia/Seoul:20261104T230000');
    expect(lines).toContain('DTSTAMP:20261102T030405Z');
    expect(lines).toContain('SEQUENCE:2');
    expect(lines).toContain('SUMMARY:알바');
    expect(lines).toContain('DESCRIPTION:5시간 · 예상 급여 51\\,600원');
    expect(lines.at(-1)).toBe('');
    expect(lines.at(-2)).toBe('END:VCALENDAR');
  });

  it('uses CRLF line endings', () => {
    const feed = buildCalendarFeed([shift()], options);
    expect(feed.split('\n').every((line, index, all) => index === all.length - 1 || line.endsWith('\r'))).toBe(true);
  });

  it('shows actual times once recorded and ends overnight shifts the next day', () => {
    const worked = shift({
      status: 'WORKED',
      actualStart: '2026-11-04T22:00',
      actualEnd: '2026-11-05T06:30',
      actualBreakMin: 30,
      plannedStart: '2026-11-04T22:00',
      plannedEnd: '2026-11-05T06:00',
    });
    const lines = unfold(buildCalendarFeed([worked], options));
    expect(lines).toContain('DTEND;TZID=Asia/Seoul:20261105T063000');
    expect(lines).toContain('DESCRIPTION:8시간 · 예상 급여 82\\,560원');
  });

  it('marks extra shifts, adds the memo, and can hide pay', () => {
    const extra = shift({ id: 'manual-1', kind: 'EXTRA', memo: '대타, 마감까지' });
    const lines = unfold(buildCalendarFeed([extra], { ...options, showPay: false }));
    expect(lines).toContain('SUMMARY:알바 (대타)');
    expect(lines).toContain('DESCRIPTION:대타\\, 마감까지');
  });

  it('leaves out cancelled and absent shifts so the calendar removes them', () => {
    const feed = buildCalendarFeed(
      [shift({ id: 'a', status: 'CANCELLED' }), shift({ id: 'b', status: 'ABSENT' }), shift({ id: 'c' })],
      options,
    );
    expect(feed.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(feed).toContain('UID:c@albapay');
  });

  it('still builds a feed when no wage applies', () => {
    const lines = unfold(buildCalendarFeed([shift()], { ...options, wages: [] }));
    expect(lines.some((line) => line.startsWith('DESCRIPTION'))).toBe(false);
  });
});
