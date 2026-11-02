import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, formatDate, nextDayStart, timeAt, toLogicalDay, weekdayOf } from './day';

// 2026-11-02 は月曜日
describe('toLogicalDay', () => {
  it('4時ちょうどからは、その日になる', () => {
    expect(toLogicalDay(new Date(2026, 10, 2, 4, 0))).toEqual({
      date: { year: 2026, month: 11, day: 2 },
      weekday: 1,
      minute: 4 * 60,
    });
  });

  it('4時より前は、前の日の夜になる', () => {
    expect(toLogicalDay(new Date(2026, 10, 3, 3, 59))).toEqual({
      date: { year: 2026, month: 11, day: 2 },
      weekday: 1,
      minute: 27 * 60 + 59,
    });
  });

  it('0時ちょうどは、前の日の 24:00 になる', () => {
    expect(toLogicalDay(new Date(2026, 10, 3, 0, 0))).toEqual({
      date: { year: 2026, month: 11, day: 2 },
      weekday: 1,
      minute: 24 * 60,
    });
  });

  it('月曜の深夜1時は、日曜の夜として扱う', () => {
    expect(toLogicalDay(new Date(2026, 10, 2, 1, 0)).weekday).toBe(0);
  });

  it('秒は切り捨てる', () => {
    expect(toLogicalDay(new Date(2026, 10, 2, 22, 59, 59, 999)).minute).toBe(22 * 60 + 59);
  });

  it('年をまたぐ深夜は、前の年の大みそかになる', () => {
    expect(toLogicalDay(new Date(2027, 0, 1, 2, 0))).toEqual({
      date: { year: 2026, month: 12, day: 31 },
      weekday: 4,
      minute: 26 * 60,
    });
  });

  it('3月1日の深夜は、うるう年なら2月29日になる', () => {
    expect(toLogicalDay(new Date(2028, 2, 1, 1, 0)).date).toEqual({
      year: 2028,
      month: 2,
      day: 29,
    });
  });
});

describe('addDays / weekdayOf', () => {
  it('月末・年末をまたぐ', () => {
    expect(addDays({ year: 2026, month: 1, day: 31 }, 1)).toEqual({ year: 2026, month: 2, day: 1 });
    expect(addDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({
      year: 2027,
      month: 1,
      day: 1,
    });
    expect(addDays({ year: 2026, month: 3, day: 1 }, -1)).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
  });

  it('曜日を返す', () => {
    expect(weekdayOf({ year: 2026, month: 11, day: 1 })).toBe(0);
    expect(weekdayOf({ year: 2026, month: 11, day: 7 })).toBe(6);
  });
});

describe('timeAt', () => {
  it('24時を超える分は翌日の時刻になる', () => {
    expect(timeAt({ year: 2026, month: 11, day: 2 }, 26 * 60)).toEqual(new Date(2026, 10, 3, 2, 0));
  });
});

describe('nextDayStart', () => {
  it('昼なら、翌日の4時を返す', () => {
    expect(nextDayStart(new Date(2026, 10, 2, 15, 0))).toEqual(new Date(2026, 10, 3, 4, 0));
  });

  it('深夜2時なら、同じ日付の4時を返す', () => {
    expect(nextDayStart(new Date(2026, 10, 3, 2, 0))).toEqual(new Date(2026, 10, 3, 4, 0));
  });

  it('4時ちょうどなら、翌日の4時を返す', () => {
    expect(nextDayStart(new Date(2026, 10, 3, 4, 0))).toEqual(new Date(2026, 10, 4, 4, 0));
  });
});

describe('formatDate', () => {
  it('月と日を2桁にそろえる', () => {
    expect(formatDate({ year: 2026, month: 1, day: 5 })).toBe('2026-01-05');
  });
});

describe('夏時間の開始が0時の地域（チリ・サンティアゴ）', () => {
  // 2026-09-06（日）は 0:00 が存在せず、1:00 から始まる
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/Santiago';
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('飛ばされた0時の直後の深夜1時半は、前の日の夜になる', () => {
    expect(toLogicalDay(new Date(2026, 8, 6, 1, 30))).toEqual({
      date: { year: 2026, month: 9, day: 5 },
      weekday: 6,
      minute: 25 * 60 + 30,
    });
  });

  it('存在しない0時を指定すると、1時になる', () => {
    const t = timeAt({ year: 2026, month: 9, day: 5 }, 24 * 60);
    expect([t.getDate(), t.getHours()]).toEqual([6, 1]);
  });

  it('区切りの4時は影響を受けない', () => {
    expect(nextDayStart(new Date(2026, 8, 5, 22, 0))).toEqual(new Date(2026, 8, 6, 4, 0));
  });
});
