import { describe, expect, it } from 'vitest';
import { describeRule, formatDuration, formatNextAllowed, formatTimeOfDay } from './format';

// 2026-11-02 は月曜日
describe('formatNextAllowed', () => {
  const now = new Date(2026, 10, 2, 12, 0);

  it('同じ日なら「今日」', () => {
    expect(formatNextAllowed(new Date(2026, 10, 2, 20, 0), now)).toBe('今日 20:00');
  });

  it('次の日なら「明日」と曜日', () => {
    expect(formatNextAllowed(new Date(2026, 10, 3, 20, 0), now)).toBe('明日（火）20:00');
  });

  it('それより先なら日付と曜日。時は0で埋めず、分は2桁にする', () => {
    expect(formatNextAllowed(new Date(2026, 10, 7, 9, 5), now)).toBe('11月7日（土）9:05');
  });

  it('深夜1時に見ると、その日の20時は「今日」', () => {
    expect(formatNextAllowed(new Date(2026, 10, 3, 20, 0), new Date(2026, 10, 3, 1, 0))).toBe(
      '今日 20:00',
    );
  });

  it('月末の翌日も「明日」', () => {
    expect(formatNextAllowed(new Date(2026, 11, 1, 20, 0), new Date(2026, 10, 30, 23, 0))).toBe(
      '明日（火）20:00',
    );
  });
});

describe('formatTimeOfDay', () => {
  it.each([
    [4 * 60, '4:00'],
    [9 * 60 + 5, '9:05'],
    [23 * 60 + 45, '23:45'],
    [24 * 60, '翌0:00'],
    [26 * 60 + 30, '翌2:30'],
    [28 * 60, '翌4:00'],
  ])('%i 分は %s', (minute, expected) => {
    expect(formatTimeOfDay(minute)).toBe(expected);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0分'],
    [59_999, '0分'],
    [23 * 60_000, '23分'],
    [60 * 60_000, '1時間'],
    [65 * 60_000 + 30_000, '1時間5分'],
  ])('%i ミリ秒は %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('describeRule', () => {
  const window = { start: 20 * 60, end: 26 * 60 };

  it.each([
    [{ type: 'none' } as const, '見ない日'],
    [{ type: 'window', window } as const, '20:00〜翌2:00'],
    [{ type: 'budget', budgetMinutes: 60 } as const, '60分まで'],
    [{ type: 'combined', window, budgetMinutes: 45 } as const, '20:00〜翌2:00のうち45分まで'],
  ])('%o は「%s」', (rule, text) => {
    expect(describeRule(rule)).toBe(text);
  });
});
