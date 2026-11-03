import { describe, expect, it } from 'vitest';
import { formatNextAllowed } from './format';

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
