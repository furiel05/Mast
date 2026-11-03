import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SCHEDULE } from '../core/default-schedule';
import type { WeeklySchedule } from '../core/schedule';
import { loadSchedule, loadVerdict } from './schedule-store';

const NONE = { type: 'none' } as const;
const ALWAYS: WeeklySchedule = Array(7).fill({
  type: 'window',
  window: { start: 4 * 60, end: 28 * 60 },
}) as unknown as WeeklySchedule;

describe('loadSchedule', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('保存されていなければ初期値を返す', async () => {
    expect(await loadSchedule()).toEqual(DEFAULT_SCHEDULE);
  });

  it('保存された予約枠を返す', async () => {
    await browser.storage.sync.set({ schedule: ALWAYS });
    expect(await loadSchedule()).toEqual(ALWAYS);
  });

  it('壊れた値が保存されていたら初期値を返す', async () => {
    await browser.storage.sync.set({ schedule: [NONE] });
    expect(await loadSchedule()).toEqual(DEFAULT_SCHEDULE);
  });
});

describe('loadVerdict', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('初期値では、平日の昼は見られず、次はその日の20時', async () => {
    // 2026-11-02 は月曜日
    expect(await loadVerdict(new Date(2026, 10, 2, 12, 0))).toEqual({
      allowed: false,
      reason: 'outside-window',
      nextAllowedAt: new Date(2026, 10, 2, 20, 0),
    });
  });

  it('保存された予約枠で判定する', async () => {
    await browser.storage.sync.set({ schedule: ALWAYS });
    expect((await loadVerdict(new Date(2026, 10, 2, 12, 0))).allowed).toBe(true);
  });
});
