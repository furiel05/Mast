import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startOfNextDay } from './date';

describe('startOfNextDay', () => {
  it('翌日の0時を返す', () => {
    const now = new Date(2026, 10, 2, 15, 30); // 2026-11-02 15:30
    expect(startOfNextDay(now)).toEqual(new Date(2026, 10, 3, 0, 0));
  });

  it('23:59:59.999 でも翌日の0時を返す', () => {
    const now = new Date(2026, 10, 2, 23, 59, 59, 999);
    expect(startOfNextDay(now)).toEqual(new Date(2026, 10, 3, 0, 0));
  });

  it('ちょうど0時なら、その次の日の0時を返す', () => {
    const now = new Date(2026, 10, 2, 0, 0);
    expect(startOfNextDay(now)).toEqual(new Date(2026, 10, 3, 0, 0));
  });

  it('月末・年末をまたぐ', () => {
    expect(startOfNextDay(new Date(2026, 1, 28, 12))).toEqual(new Date(2026, 2, 1));
    expect(startOfNextDay(new Date(2026, 11, 31, 12))).toEqual(new Date(2027, 0, 1));
  });

  it('うるう年の2月29日を扱う', () => {
    expect(startOfNextDay(new Date(2028, 1, 28, 12))).toEqual(new Date(2028, 1, 29));
  });

  describe('夏時間の開始が0時の地域（チリ・サンティアゴ）', () => {
    const originalTz = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = 'America/Santiago';
    });
    afterAll(() => {
      process.env.TZ = originalTz;
    });

    it('0時が存在しない日は、その日の最初の時刻（1時）を返す', () => {
      // 2026-09-06 は 0:00 が存在せず、1:00 から始まる
      const next = startOfNextDay(new Date(2026, 8, 5, 12));
      expect(next.getDate()).toBe(6);
      expect(next.getHours()).toBe(1);
    });
  });
});
