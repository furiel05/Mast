import { describe, expect, it } from 'vitest';
import type { DayRule } from '../../core/schedule';
import {
  ALL_DAY,
  formatHour,
  hourOptions,
  joinTime,
  minuteOptions,
  summarize,
  toForm,
  toRule,
} from './day-form';

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

describe('hourOptions', () => {
  it('始まりは4時から翌3時まで', () => {
    const hours = hourOptions('start');
    expect([hours[0], hours.at(-1), hours.length]).toEqual([4, 27, 24]);
  });

  it('終わりは翌4時まで', () => {
    expect(hourOptions('end').at(-1)).toBe(28);
  });
});

describe('minuteOptions', () => {
  it('15分刻み', () => {
    expect(minuteOptions(20 * 60 + 30)).toEqual([0, 15, 30, 45]);
  });

  it('15分刻みでない時刻が保存されていれば、その分も並べる', () => {
    expect(minuteOptions(21 * 60 + 10)).toEqual([0, 10, 15, 30, 45]);
  });
});

describe('joinTime', () => {
  it('時と分を合わせる。翌日の時刻は24時以降になる', () => {
    expect(joinTime(20, 15)).toBe(20 * 60 + 15);
    expect(joinTime(25, 30)).toBe(25 * 60 + 30);
  });

  it('翌4時台は翌4:00にそろえる', () => {
    expect(joinTime(28, 45)).toBe(28 * 60);
  });
});

describe('formatHour', () => {
  it.each([
    [4, '4'],
    [23, '23'],
    [24, '翌0'],
    [28, '翌4'],
  ])('%i は「%s」', (hour, text) => {
    expect(formatHour(hour)).toBe(text);
  });
});

describe('summarize', () => {
  it.each<[string, Parameters<typeof summarize>[0], string]>([
    [
      '時間帯だけ',
      { range: evening, limitMinutes: null },
      '20:00〜23:00 の間なら、いつでも見られます',
    ],
    ['いつでも・上限なし', { range: ALL_DAY, limitMinutes: null }, '1日中いつでも見られます'],
    ['いつでも＋上限', { range: ALL_DAY, limitMinutes: 120 }, 'いつでも、合計2時間まで見られます'],
    [
      '時間帯＋上限',
      { range: evening, limitMinutes: 90 },
      '20:00〜23:00 のうち、合計1時間30分まで見られます',
    ],
    [
      '上限が時間帯より長い',
      { range: evening, limitMinutes: 180 },
      '20:00〜23:00 の間なら、いつでも見られます（上限は時間帯より長いので、上限なしと同じです）',
    ],
    ['上限が入力されていない', { range: evening, limitMinutes: Number.NaN }, ''],
  ])('%s', (_, form, text) => {
    expect(summarize(form)).toBe(text);
  });
});
