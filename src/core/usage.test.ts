import { describe, expect, it } from 'vitest';
import { splitByDay, staleUsageKeys, sumUsage, usageKey, usageMsOf } from './usage';

const MINUTE = 60 * 1000;

describe('usageKey', () => {
  it('日付と端末IDからキーを作る', () => {
    expect(usageKey({ year: 2026, month: 11, day: 2 }, 'device-a')).toBe(
      'usage_2026-11-02_device-a',
    );
  });
});

describe('usageMsOf', () => {
  it('正の数ならそのまま返す', () => {
    expect(usageMsOf(1500)).toBe(1500);
  });

  it.each([undefined, null, '1500', -1, Number.NaN, Number.POSITIVE_INFINITY])(
    '数でない値や負の値（%s）は 0 とみなす',
    (value) => {
      expect(usageMsOf(value)).toBe(0);
    },
  );
});

describe('sumUsage', () => {
  const nov2 = { year: 2026, month: 11, day: 2 };

  it('その日の記録を全端末分合計する', () => {
    const items = {
      'usage_2026-11-02_device-a': 10 * MINUTE,
      'usage_2026-11-02_device-b': 5 * MINUTE,
    };
    expect(sumUsage(items, nov2)).toBe(15 * MINUTE);
  });

  it('ほかの日の記録と、記録でない項目は数えない', () => {
    const items = {
      'usage_2026-11-01_device-a': 10 * MINUTE,
      'usage_2026-11-02_device-a': 3 * MINUTE,
      schedule: [],
      usage_broken: 99,
    };
    expect(sumUsage(items, nov2)).toBe(3 * MINUTE);
  });

  it('記録がなければ 0', () => {
    expect(sumUsage({}, nov2)).toBe(0);
  });

  it('壊れた値は 0 とみなす', () => {
    const items = {
      'usage_2026-11-02_device-a': 'x',
      'usage_2026-11-02_device-b': 2 * MINUTE,
    };
    expect(sumUsage(items, nov2)).toBe(2 * MINUTE);
  });
});

describe('staleUsageKeys', () => {
  it('7日より前の記録だけを返す（今日を含めて8日分を残す）', () => {
    const keys = [
      'usage_2026-11-10_a', // 今日
      'usage_2026-11-03_a', // 7日前：残す
      'usage_2026-11-02_a', // 8日前：消す
      'usage_2026-10-20_b',
      'schedule',
    ];
    expect(staleUsageKeys(keys, { year: 2026, month: 11, day: 10 })).toEqual([
      'usage_2026-11-02_a',
      'usage_2026-10-20_b',
    ]);
  });

  it('月や年をまたいでも日付の前後で判定する', () => {
    const keys = ['usage_2025-12-25_a', 'usage_2025-12-26_a', 'usage_2025-12-31_a'];
    expect(staleUsageKeys(keys, { year: 2026, month: 1, day: 2 })).toEqual(['usage_2025-12-25_a']);
  });
});

describe('splitByDay', () => {
  it('4時をまたがなければ、その日の1件にする', () => {
    expect(splitByDay(new Date(2026, 10, 2, 20, 0), new Date(2026, 10, 2, 20, 30))).toEqual([
      { date: { year: 2026, month: 11, day: 2 }, ms: 30 * MINUTE },
    ]);
  });

  it('0時をまたいでも、4時より前なら前の日の1件にする', () => {
    expect(splitByDay(new Date(2026, 10, 2, 23, 50), new Date(2026, 10, 3, 0, 10))).toEqual([
      { date: { year: 2026, month: 11, day: 2 }, ms: 20 * MINUTE },
    ]);
  });

  it('4時をまたいだら、前の日と次の日に分ける', () => {
    expect(splitByDay(new Date(2026, 10, 3, 3, 50), new Date(2026, 10, 3, 4, 5))).toEqual([
      { date: { year: 2026, month: 11, day: 2 }, ms: 10 * MINUTE },
      { date: { year: 2026, month: 11, day: 3 }, ms: 5 * MINUTE },
    ]);
  });

  it('ちょうど4時に始まった分は、その日に入れる', () => {
    expect(splitByDay(new Date(2026, 10, 3, 4, 0), new Date(2026, 10, 3, 4, 1))).toEqual([
      { date: { year: 2026, month: 11, day: 3 }, ms: MINUTE },
    ]);
  });

  it('月末の4時をまたいでも、日付が正しく進む', () => {
    expect(splitByDay(new Date(2026, 10, 30, 23, 0), new Date(2026, 11, 1, 5, 0))).toEqual([
      { date: { year: 2026, month: 11, day: 30 }, ms: 5 * 60 * MINUTE },
      { date: { year: 2026, month: 12, day: 1 }, ms: 60 * MINUTE },
    ]);
  });

  it('終わりが始まり以前なら空', () => {
    const at = new Date(2026, 10, 2, 20, 0);
    expect(splitByDay(at, at)).toEqual([]);
    expect(splitByDay(at, new Date(2026, 10, 2, 19, 0))).toEqual([]);
  });
});
