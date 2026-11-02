import { describe, expect, it } from 'vitest';
import { type DayRule, evaluate, validateSchedule, type WeeklySchedule } from './schedule';

const MIN = 60 * 1000;

/** 2026年11月の日時。2日が月曜、8日が日曜 */
const nov = (day: number, hour: number, minute = 0, second = 0) =>
  new Date(2026, 10, day, hour, minute, second);

const everyDay = (rule: DayRule): WeeklySchedule => [rule, rule, rule, rule, rule, rule, rule];

/** 平日と土日で分ける */
const weekdaysAndWeekend = (weekday: DayRule, weekend: DayRule): WeeklySchedule => [
  weekend,
  weekday,
  weekday,
  weekday,
  weekday,
  weekday,
  weekend,
];

const NONE: DayRule = { type: 'none' };
const timeWindow = (startHour: number, endHour: number): DayRule => ({
  type: 'window',
  window: { start: startHour * 60, end: endHour * 60 },
});
const budget = (minutes: number): DayRule => ({ type: 'budget', budgetMinutes: minutes });
const combined = (startHour: number, endHour: number, minutes: number): DayRule => ({
  type: 'combined',
  window: { start: startHour * 60, end: endHour * 60 },
  budgetMinutes: minutes,
});

describe('evaluate：時間帯ルール（毎日20〜23時）', () => {
  const schedule = everyDay(timeWindow(20, 23));

  it('始まる前は見られず、次はその日の20時', () => {
    expect(evaluate(schedule, nov(2, 19, 59), 0)).toEqual({
      allowed: false,
      reason: 'outside-window',
      nextAllowedAt: nov(2, 20),
    });
  });

  it('20時ちょうどから見られ、23時まで', () => {
    expect(evaluate(schedule, nov(2, 20), 0)).toEqual({
      allowed: true,
      allowedUntil: nov(2, 23),
      remainingMs: null,
    });
  });

  it('22:59:59 はまだ見られる', () => {
    expect(evaluate(schedule, nov(2, 22, 59, 59), 0).allowed).toBe(true);
  });

  it('23時ちょうどで見られなくなり、次は翌日の20時', () => {
    expect(evaluate(schedule, nov(2, 23), 0)).toEqual({
      allowed: false,
      reason: 'outside-window',
      nextAllowedAt: nov(3, 20),
    });
  });

  it('深夜3時59分は前の日の夜として扱い、次はその日の20時', () => {
    expect(evaluate(schedule, nov(3, 3, 59), 0)).toEqual({
      allowed: false,
      reason: 'outside-window',
      nextAllowedAt: nov(3, 20),
    });
  });

  it('時間帯ルールでは視聴時間を数えない', () => {
    expect(evaluate(schedule, nov(2, 21), 999 * MIN).allowed).toBe(true);
  });
});

describe('evaluate：0時をまたぐ時間帯（22:00〜翌2:00）', () => {
  it('深夜1時は前の日のルールで見られ、2時まで', () => {
    expect(evaluate(everyDay(timeWindow(22, 26)), nov(3, 1), 0)).toEqual({
      allowed: true,
      allowedUntil: nov(3, 2),
      remainingMs: null,
    });
  });

  it('深夜2時で見られなくなり、次はその日の22時', () => {
    expect(evaluate(everyDay(timeWindow(22, 26)), nov(3, 2), 0)).toEqual({
      allowed: false,
      reason: 'outside-window',
      nextAllowedAt: nov(3, 22),
    });
  });

  it('火曜が「見ない日」でも、火曜の深夜1時は月曜の夜なので見られる', () => {
    const schedule: WeeklySchedule = [NONE, timeWindow(22, 26), NONE, NONE, NONE, NONE, NONE];
    expect(evaluate(schedule, nov(3, 1), 0).allowed).toBe(true);
  });
});

describe('evaluate：予算ルール（毎日60分）', () => {
  const schedule = everyDay(budget(60));

  it('予算が残っていれば見られ、残り時間を返す', () => {
    expect(evaluate(schedule, nov(2, 10), 15 * MIN)).toEqual({
      allowed: true,
      allowedUntil: nov(3, 4),
      remainingMs: 45 * MIN,
    });
  });

  it('予算を使い切ったら見られず、次は翌朝4時', () => {
    expect(evaluate(schedule, nov(2, 10), 60 * MIN)).toEqual({
      allowed: false,
      reason: 'budget-exhausted',
      nextAllowedAt: nov(3, 4),
    });
  });

  it('使いすぎていても残り時間はマイナスにならない', () => {
    expect(evaluate(schedule, nov(2, 10), 90 * MIN)).toMatchObject({ allowed: false });
  });

  it('深夜3時59分はまだ前の日の予算で判定し、次は4時', () => {
    expect(evaluate(schedule, nov(3, 3, 59), 60 * MIN)).toEqual({
      allowed: false,
      reason: 'budget-exhausted',
      nextAllowedAt: nov(3, 4),
    });
  });
});

describe('evaluate：組み合わせルール（毎日20〜23時のうち60分）', () => {
  const schedule = everyDay(combined(20, 23, 60));

  it('時間帯の中で予算が残っていれば見られ、23時までで残りは30分', () => {
    expect(evaluate(schedule, nov(2, 21), 30 * MIN)).toEqual({
      allowed: true,
      allowedUntil: nov(2, 23),
      remainingMs: 30 * MIN,
    });
  });

  it('時間帯の中でも予算を使い切ったら見られず、次は翌日の20時', () => {
    expect(evaluate(schedule, nov(2, 21), 60 * MIN)).toEqual({
      allowed: false,
      reason: 'budget-exhausted',
      nextAllowedAt: nov(3, 20),
    });
  });

  it('時間帯の前は見られず、次はその日の20時', () => {
    expect(evaluate(schedule, nov(2, 19), 0)).toEqual({
      allowed: false,
      reason: 'outside-window',
      nextAllowedAt: nov(2, 20),
    });
  });

  it('予算が残っていても、時間帯の後は見られない', () => {
    expect(evaluate(schedule, nov(2, 23, 30), 0)).toEqual({
      allowed: false,
      reason: 'outside-window',
      nextAllowedAt: nov(3, 20),
    });
  });
});

describe('evaluate：次に見られる時刻を曜日をまたいで探す', () => {
  it('金曜の枠の後は、土曜の朝9時', () => {
    const schedule = weekdaysAndWeekend(timeWindow(20, 23), timeWindow(9, 23));
    expect(evaluate(schedule, nov(6, 23, 30), 0)).toMatchObject({ nextAllowedAt: nov(7, 9) });
  });

  it('日曜の枠の後は、月曜の20時', () => {
    const schedule = weekdaysAndWeekend(timeWindow(20, 23), timeWindow(9, 23));
    expect(evaluate(schedule, nov(8, 23, 30), 0)).toMatchObject({ nextAllowedAt: nov(9, 20) });
  });

  it('月曜しか見られない日がなければ、月曜の枠の後は翌週の月曜', () => {
    const schedule: WeeklySchedule = [NONE, timeWindow(20, 23), NONE, NONE, NONE, NONE, NONE];
    expect(evaluate(schedule, nov(2, 23, 30), 0)).toMatchObject({ nextAllowedAt: nov(9, 20) });
  });

  it('予算0分の日は飛ばす', () => {
    const schedule: WeeklySchedule = [
      budget(60),
      timeWindow(20, 23),
      timeWindow(20, 23),
      timeWindow(20, 23),
      timeWindow(20, 23),
      timeWindow(20, 23),
      budget(0),
    ];
    expect(evaluate(schedule, nov(6, 23, 30), 0)).toMatchObject({ nextAllowedAt: nov(8, 4) });
  });

  it('組み合わせルールで予算0分の日は、時間帯の前でもその日を飛ばす', () => {
    const schedule: WeeklySchedule = [
      NONE,
      combined(20, 23, 0),
      timeWindow(20, 23),
      NONE,
      NONE,
      NONE,
      NONE,
    ];
    expect(evaluate(schedule, nov(2, 19), 0)).toMatchObject({ nextAllowedAt: nov(3, 20) });
  });

  it('1週間ずっと「見ない日」なら、次に見られる時刻はない', () => {
    expect(evaluate(everyDay(NONE), nov(2, 12), 0)).toEqual({
      allowed: false,
      reason: 'outside-window',
      nextAllowedAt: null,
    });
  });

  it('月末をまたいで探す', () => {
    const schedule = everyDay(timeWindow(20, 23));
    expect(evaluate(schedule, new Date(2026, 10, 30, 23, 30), 0)).toMatchObject({
      nextAllowedAt: new Date(2026, 11, 1, 20),
    });
  });
});

describe('validateSchedule', () => {
  it('正しいルールなら誤りはない', () => {
    const schedule: WeeklySchedule = [
      NONE,
      timeWindow(4, 28),
      timeWindow(22, 26),
      budget(0),
      budget(1440),
      combined(20, 23, 60),
      NONE,
    ];
    expect(validateSchedule(schedule)).toEqual([]);
  });

  it('4時より前に始まる時間帯は誤り', () => {
    expect(validateSchedule([timeWindow(3, 10), NONE, NONE, NONE, NONE, NONE, NONE])).toEqual([
      '日曜：時間帯は朝4時から翌朝4時までの間で指定してください',
    ]);
  });

  it('翌朝4時を超える時間帯は誤り', () => {
    expect(validateSchedule([NONE, timeWindow(22, 29), NONE, NONE, NONE, NONE, NONE])).toEqual([
      '月曜：時間帯は朝4時から翌朝4時までの間で指定してください',
    ]);
  });

  it('終わりが始まりより前の時間帯は誤り', () => {
    expect(validateSchedule([NONE, NONE, timeWindow(23, 20), NONE, NONE, NONE, NONE])).toEqual([
      '火曜：時間帯の終わりは始まりより後にしてください',
    ]);
  });

  it('予算が範囲外や小数なら誤り', () => {
    expect(
      validateSchedule([NONE, NONE, NONE, budget(-1), budget(1441), budget(1.5), NONE]),
    ).toEqual([
      '水曜：予算は0〜1440分の整数で指定してください',
      '木曜：予算は0〜1440分の整数で指定してください',
      '金曜：予算は0〜1440分の整数で指定してください',
    ]);
  });

  it('組み合わせルールは時間帯と予算の両方を確かめる', () => {
    expect(validateSchedule([NONE, NONE, NONE, NONE, NONE, NONE, combined(23, 20, -5)])).toEqual([
      '土曜：時間帯の終わりは始まりより後にしてください',
      '土曜：予算は0〜1440分の整数で指定してください',
    ]);
  });
});
