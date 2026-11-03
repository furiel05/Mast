import { describe, expect, it } from 'vitest';
import { compareSchedules } from './compare';
import type { DayRule, WeeklySchedule } from './schedule';

const NONE: DayRule = { type: 'none' };
const window = (start: number, end: number): DayRule => ({
  type: 'window',
  window: { start: start * 60, end: end * 60 },
});
const budget = (budgetMinutes: number): DayRule => ({ type: 'budget', budgetMinutes });
const combined = (start: number, end: number, budgetMinutes: number): DayRule => ({
  type: 'combined',
  window: { start: start * 60, end: end * 60 },
  budgetMinutes,
});

/** 月曜だけ rule にし、ほかの曜日は20〜23時にした予約枠 */
function withMonday(rule: DayRule): WeeklySchedule {
  const base = window(20, 23);
  return [base, rule, base, base, base, base, base];
}

describe('compareSchedules', () => {
  it('同じ予約枠なら same', () => {
    expect(compareSchedules(withMonday(window(20, 23)), withMonday(window(20, 23)))).toBe('same');
  });

  it.each<[string, DayRule, DayRule]>([
    ['時間帯を短くする', window(20, 23), window(21, 23)],
    ['時間帯を終わりから縮める', window(20, 23), window(20, 22)],
    ['見ない日にする', window(20, 23), NONE],
    ['予算を減らす', budget(60), budget(30)],
    ['時間帯に予算を加える', window(20, 23), combined(20, 23, 60)],
    ['予算に時間帯を加える', budget(60), combined(20, 23, 60)],
    ['組み合わせの時間帯を短くする', combined(20, 23, 60), combined(21, 23, 60)],
    ['予算を0分にする', budget(60), budget(0)],
    ['1日中の時間帯を、予算に変える', window(4, 28), budget(60)],
  ])('%s のは narrower', (_, before, after) => {
    expect(compareSchedules(withMonday(before), withMonday(after))).toBe('narrower');
  });

  it.each<[string, DayRule, DayRule]>([
    ['時間帯を長くする', window(21, 23), window(20, 23)],
    ['時間帯をずらす（縮めつつ別の時間に広げる）', window(20, 23), window(21, 24)],
    ['見ない日に時間帯を設定する', NONE, window(20, 21)],
    ['予算を増やす', budget(30), budget(60)],
    ['予算をなくして時間帯だけにする', combined(20, 23, 60), window(20, 23)],
    ['時間帯から予算に変える（比べられない）', window(20, 23), budget(60)],
    ['予算から時間帯に変える（比べられない）', budget(60), window(20, 23)],
  ])('%s のは wider', (_, before, after) => {
    expect(compareSchedules(withMonday(before), withMonday(after))).toBe('wider');
  });

  it('1つの曜日で狭めても、別の曜日で広げれば wider', () => {
    const before = withMonday(window(20, 23));
    const after: WeeklySchedule = [
      window(19, 23),
      NONE,
      ...before.slice(2),
    ] as unknown as WeeklySchedule;
    expect(compareSchedules(before, after)).toBe('wider');
  });

  describe('見てよい範囲が実質的に同じなら、書き方が違っても same', () => {
    it.each<[string, DayRule, DayRule]>([
      ['見ない日と、予算0分', NONE, budget(0)],
      ['見ない日と、組み合わせで予算0分', NONE, combined(20, 23, 0)],
      ['時間帯と、時間帯より長い予算の組み合わせ', window(20, 21), combined(20, 21, 120)],
      ['1日中の時間帯と、1440分の予算', window(4, 28), budget(1440)],
    ])('%s', (_, before, after) => {
      expect(compareSchedules(withMonday(before), withMonday(after))).toBe('same');
      expect(compareSchedules(withMonday(after), withMonday(before))).toBe('same');
    });
  });
});
