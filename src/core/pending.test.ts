import { describe, expect, it } from 'vitest';
import {
  createPendingChange,
  effectiveSchedule,
  evaluateWithPending,
  type PendingChange,
  parsePendingChange,
} from './pending';
import { type DayRule, evaluate, type WeeklySchedule } from './schedule';

const MIN = 60 * 1000;

/** 2026年11月の日時。2日が月曜 */
const nov = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute);

const everyDay = (rule: DayRule): WeeklySchedule => [rule, rule, rule, rule, rule, rule, rule];

/** 月曜だけ rule で、ほかの曜日は見ない日 */
const mondayOnly = (rule: DayRule): WeeklySchedule => [NONE, rule, NONE, NONE, NONE, NONE, NONE];

const NONE: DayRule = { type: 'none' };
const timeWindow = (startHour: number, endHour: number): DayRule => ({
  type: 'window',
  window: { start: startHour * 60, end: endHour * 60 },
});
const budget = (minutes: number): DayRule => ({ type: 'budget', budgetMinutes: minutes });

/** effectiveAt に反映される変更 */
const pendingAt = (schedule: WeeklySchedule, effectiveAt: Date): PendingChange => ({
  schedule,
  requestedAt: effectiveAt.getTime() - 24 * 60 * MIN,
  effectiveAt: effectiveAt.getTime(),
});

describe('createPendingChange', () => {
  it('申請から24時間後に反映される', () => {
    const change = createPendingChange(everyDay(NONE), nov(2, 23, 55));
    expect(change.requestedAt).toBe(nov(2, 23, 55).getTime());
    expect(change.effectiveAt).toBe(nov(3, 23, 55).getTime());
  });

  it('夏時間の切り替わりをまたいでも、ちょうど24時間後', () => {
    // 米国東部時間では 2026-11-01 2:00 に夏時間が終わり、時計が1時間戻る。
    // 時計の上では23時間後になるが、待つ時間が24時間であることが大事
    const requested = new Date('2026-10-31T12:00:00-04:00');
    const change = createPendingChange(everyDay(NONE), requested);
    expect(change.effectiveAt - change.requestedAt).toBe(24 * 60 * MIN);
  });
});

describe('parsePendingChange', () => {
  const valid = createPendingChange(everyDay(timeWindow(20, 23)), nov(2, 12));

  it('正しい形なら読める', () => {
    expect(parsePendingChange(structuredClone(valid))).toEqual(valid);
  });

  it('保存されていなければ null', () => {
    expect(parsePendingChange(undefined)).toBeNull();
  });

  it('時刻が欠けていれば null', () => {
    expect(parsePendingChange({ schedule: valid.schedule, requestedAt: 0 })).toBeNull();
  });

  it('予約枠に誤りがあれば null', () => {
    expect(parsePendingChange({ ...valid, schedule: everyDay(timeWindow(23, 20)) })).toBeNull();
  });
});

describe('effectiveSchedule', () => {
  const saved = everyDay(NONE);
  const next = everyDay(timeWindow(20, 23));
  const pending = pendingAt(next, nov(3, 12));

  it('反映される時刻の前は、保存されている予約枠', () => {
    expect(effectiveSchedule(saved, pending, new Date(nov(3, 12).getTime() - 1))).toBe(saved);
  });

  it('反映される時刻ちょうどから、予約中の変更の予約枠', () => {
    expect(effectiveSchedule(saved, pending, nov(3, 12))).toBe(next);
  });

  it('予約中の変更がなければ、保存されている予約枠', () => {
    expect(effectiveSchedule(saved, null, nov(3, 12))).toBe(saved);
  });
});

describe('evaluateWithPending', () => {
  it('予約中の変更がなければ、保存されている予約枠で判定する', () => {
    const saved = everyDay(timeWindow(20, 23));
    expect(evaluateWithPending(saved, null, nov(2, 12), 0)).toEqual(evaluate(saved, nov(2, 12), 0));
  });

  it('反映される時刻を過ぎていれば、変更後の予約枠で判定する', () => {
    const pending = pendingAt(everyDay(timeWindow(9, 23)), nov(2, 10));
    expect(evaluateWithPending(everyDay(NONE), pending, nov(2, 12), 0)).toMatchObject({
      allowed: true,
      allowedUntil: nov(2, 23),
    });
  });

  it('見られる間は、反映前の予約枠での終わりを返す', () => {
    // 22時に 20〜24時へ広がるが、22時に判定し直せば延びる
    const pending = pendingAt(everyDay(timeWindow(20, 24)), nov(2, 22));
    expect(evaluateWithPending(everyDay(timeWindow(20, 23)), pending, nov(2, 21), 0)).toMatchObject(
      { allowed: true, allowedUntil: nov(2, 23) },
    );
  });

  describe('見られないときの、次に見られる時刻', () => {
    it('反映された時刻にもう見られるなら、反映される時刻', () => {
      // 今の予約枠なら火曜20時からだが、火曜10時に 9〜23時へ広がる
      const pending = pendingAt(everyDay(timeWindow(9, 23)), nov(3, 10));
      expect(evaluateWithPending(everyDay(timeWindow(20, 23)), pending, nov(2, 23, 30), 0)).toEqual(
        { allowed: false, reason: 'outside-window', nextAllowedAt: nov(3, 10) },
      );
    });

    it('反映されたあとの予約枠で、最初に見られる時刻', () => {
      const pending = pendingAt(everyDay(timeWindow(20, 23)), nov(2, 15));
      expect(evaluateWithPending(everyDay(NONE), pending, nov(2, 12), 0)).toMatchObject({
        allowed: false,
        nextAllowedAt: nov(2, 20),
      });
    });

    it('反映される前に今の予約枠で見られるなら、その時刻', () => {
      const pending = pendingAt(everyDay(timeWindow(9, 23)), nov(3, 10));
      expect(
        evaluateWithPending(everyDay(timeWindow(20, 23)), pending, nov(2, 12), 0),
      ).toMatchObject({ allowed: false, nextAllowedAt: nov(2, 20) });
    });

    it('反映されたあとの予約枠でも見られる時間がなければ null', () => {
      const pending = pendingAt(everyDay(NONE), nov(2, 15));
      expect(evaluateWithPending(everyDay(NONE), pending, nov(2, 12), 0)).toMatchObject({
        allowed: false,
        nextAllowedAt: null,
      });
    });

    describe('予算', () => {
      // 月曜の予算30分を使い切った
      const saved = mondayOnly(budget(30));
      const usedMs = 30 * MIN;

      it('同じ日に反映されるなら、使った時間はそのまま数える', () => {
        const pending = pendingAt(everyDay(budget(60)), nov(2, 18));
        expect(evaluateWithPending(saved, pending, nov(2, 12), usedMs)).toEqual({
          allowed: false,
          reason: 'budget-exhausted',
          nextAllowedAt: nov(2, 18),
        });
      });

      it('同じ日に反映されても予算が足りなければ、次の日の始まり', () => {
        const pending = pendingAt(everyDay(budget(20)), nov(2, 18));
        expect(evaluateWithPending(saved, pending, nov(2, 12), usedMs)).toMatchObject({
          nextAllowedAt: nov(3, 4),
        });
      });

      it('深夜1時に反映されるときも、4時区切りでは同じ日', () => {
        const pending = pendingAt(everyDay(budget(20)), nov(3, 1));
        expect(evaluateWithPending(saved, pending, nov(2, 23), usedMs)).toMatchObject({
          nextAllowedAt: nov(3, 4),
        });
      });

      it('次の日（朝4時ちょうど）に反映されるなら、予算はリセットされている', () => {
        const pending = pendingAt(everyDay(budget(20)), nov(3, 4));
        expect(evaluateWithPending(saved, pending, nov(2, 12), usedMs)).toMatchObject({
          nextAllowedAt: nov(3, 4),
        });
      });
    });
  });
});
