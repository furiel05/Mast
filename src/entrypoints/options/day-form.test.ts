import { describe, expect, it } from 'vitest';
import type { DayRule } from '../../core/schedule';
import { ALL_DAY, parseTimeOfDay, toForm, toRule } from './day-form';

const evening = { start: 20 * 60, end: 23 * 60 };

describe('toRule', () => {
  it.each<[string, Parameters<typeof toRule>[0], DayRule]>([
    ['見ない', null, { type: 'none' }],
    ['時間帯だけ', { range: evening, limitMinutes: null }, { type: 'window', window: evening }],
    ['いつでも＋上限', { range: ALL_DAY, limitMinutes: 60 }, { type: 'budget', budgetMinutes: 60 }],
    [
      '時間帯＋上限',
      { range: evening, limitMinutes: 60 },
      { type: 'combined', window: evening, budgetMinutes: 60 },
    ],
    [
      'いつでも・上限なし',
      { range: ALL_DAY, limitMinutes: null },
      { type: 'window', window: ALL_DAY },
    ],
  ])('%s', (_, form, rule) => {
    expect(toRule(form)).toEqual(rule);
  });
});

describe('toForm', () => {
  it.each<DayRule>([
    { type: 'none' },
    { type: 'window', window: evening },
    { type: 'budget', budgetMinutes: 60 },
    { type: 'combined', window: evening, budgetMinutes: 45 },
  ])('%o は toRule で元に戻る', (rule) => {
    expect(toRule(toForm(rule))).toEqual(rule);
  });

  it('1日中の組み合わせルールは、いつでも＋上限として読む', () => {
    expect(toForm({ type: 'combined', window: ALL_DAY, budgetMinutes: 30 })).toEqual({
      range: ALL_DAY,
      limitMinutes: 30,
    });
  });
});

describe('parseTimeOfDay', () => {
  it.each([
    ['20:00', 20 * 60],
    ['20:30', 20 * 60 + 30],
    ['20', 20 * 60],
    ['2030', 20 * 60 + 30],
    ['9:05', 9 * 60 + 5],
    ['４:００', 4 * 60],
    [' 21 : 15 ', 21 * 60 + 15],
  ])('「%s」は当日の時刻', (text, minute) => {
    expect(parseTimeOfDay(text)).toBe(minute);
  });

  it.each([
    ['翌1:00', 25 * 60],
    ['1:00', 25 * 60],
    ['0:00', 24 * 60],
    ['25:00', 25 * 60],
    ['3:59', 27 * 60 + 59],
    ['翌4:00', 28 * 60],
  ])('「%s」は翌日の時刻（4時区切り）', (text, minute) => {
    expect(parseTimeOfDay(text)).toBe(minute);
  });

  it.each(['', 'abc', '20:60', '翌5:00', '29:00', '20:5', '123456'])('「%s」は読めない', (text) => {
    expect(parseTimeOfDay(text)).toBeNull();
  });
});
