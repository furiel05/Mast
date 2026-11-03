import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SCHEDULE } from '../core/default-schedule';
import type { PendingChange } from '../core/pending';
import type { WeeklySchedule } from '../core/schedule';
import { totp } from '../core/totp';
import {
  cancelPendingChange,
  loadScheduleState,
  loadVerdict,
  saveSchedule,
} from './schedule-store';

const NONE = { type: 'none' } as const;
const ALWAYS: WeeklySchedule = Array(7).fill({
  type: 'window',
  window: { start: 4 * 60, end: 28 * 60 },
}) as unknown as WeeklySchedule;
const NEVER: WeeklySchedule = Array(7).fill(NONE) as unknown as WeeklySchedule;
const EVENINGS: WeeklySchedule = Array(7).fill({
  type: 'window',
  window: { start: 20 * 60, end: 23 * 60 },
}) as unknown as WeeklySchedule;

/** 2026-11-02（月）12:00 */
const NOW = new Date(2026, 10, 2, 12, 0);
const HOUR = 60 * 60 * 1000;

/** RFC 6238 の秘密鍵（"12345678901234567890"）を Base32 にしたもの */
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const codeAt = (time: Date) => totp(new TextEncoder().encode('12345678901234567890'), time);

const pendingAt = (schedule: WeeklySchedule, effectiveAt: Date): PendingChange => ({
  schedule,
  requestedAt: effectiveAt.getTime() - 24 * HOUR,
  effectiveAt: effectiveAt.getTime(),
});

describe('loadScheduleState', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('保存されていなければ初期値を返す', async () => {
    expect(await loadScheduleState(NOW)).toEqual({ schedule: DEFAULT_SCHEDULE, pending: null });
  });

  it('保存された予約枠を返す', async () => {
    await browser.storage.sync.set({ schedule: ALWAYS });
    expect((await loadScheduleState(NOW)).schedule).toEqual(ALWAYS);
  });

  it('壊れた値が保存されていたら初期値を返す', async () => {
    await browser.storage.sync.set({ schedule: [NONE], pendingChange: { schedule: ALWAYS } });
    expect(await loadScheduleState(NOW)).toEqual({ schedule: DEFAULT_SCHEDULE, pending: null });
  });

  it('反映される前の変更は、予約中として返す', async () => {
    const pending = pendingAt(ALWAYS, new Date(NOW.getTime() + HOUR));
    await browser.storage.sync.set({ schedule: NEVER, pendingChange: pending });
    expect(await loadScheduleState(NOW)).toEqual({ schedule: NEVER, pending });
  });

  it('反映される時刻を過ぎた変更は、今の予約枠として返す', async () => {
    const pending = pendingAt(ALWAYS, NOW);
    await browser.storage.sync.set({ schedule: NEVER, pendingChange: pending });
    expect(await loadScheduleState(NOW)).toEqual({ schedule: ALWAYS, pending: null });
  });
});

describe('saveSchedule', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('storage.sync に保存し、読み直せる', async () => {
    expect(await saveSchedule(ALWAYS, NOW)).toEqual({ status: 'applied' });
    expect(await browser.storage.sync.get('schedule')).toEqual({ schedule: ALWAYS });
    expect((await loadScheduleState(NOW)).schedule).toEqual(ALWAYS);
  });

  it('誤りのある予約枠は保存しない', async () => {
    const broken = [
      { type: 'window', window: { start: 23 * 60, end: 20 * 60 } },
      ...ALWAYS.slice(1),
    ] as unknown as WeeklySchedule;

    await expect(saveSchedule(broken, NOW)).rejects.toThrow(
      '日曜：時間帯の終わりは始まりより後にしてください',
    );
    expect(await browser.storage.sync.get(null)).toEqual({});
  });

  describe('承認コードのセットアップ前', () => {
    it('広げる変更も、すぐに反映する', async () => {
      await browser.storage.sync.set({ schedule: NEVER });
      expect(await saveSchedule(ALWAYS, NOW)).toEqual({ status: 'applied' });
      expect((await loadScheduleState(NOW)).schedule).toEqual(ALWAYS);
    });
  });

  describe('承認コードのセットアップ後', () => {
    beforeEach(async () => {
      await browser.storage.sync.set({ schedule: EVENINGS, totpSecret: SECRET });
    });

    it('狭める変更は、コードなしですぐに反映する', async () => {
      expect(await saveSchedule(NEVER, NOW)).toEqual({ status: 'applied' });
      expect((await loadScheduleState(NOW)).schedule).toEqual(NEVER);
    });

    it('広げる変更は、コードが合えば24時間後に反映されるよう予約する', async () => {
      expect(await saveSchedule(ALWAYS, NOW, await codeAt(NOW))).toEqual({
        status: 'requested',
        effectiveAt: new Date(NOW.getTime() + 24 * HOUR),
      });
      expect(await loadScheduleState(NOW)).toEqual({
        schedule: EVENINGS,
        pending: {
          schedule: ALWAYS,
          requestedAt: NOW.getTime(),
          effectiveAt: NOW.getTime() + 24 * HOUR,
        },
      });
      expect((await loadScheduleState(new Date(NOW.getTime() + 24 * HOUR))).schedule).toEqual(
        ALWAYS,
      );
    });

    it('広げる変更は、コードが違うか入力されていなければ保存しない', async () => {
      const wrong = String((Number(await codeAt(NOW)) + 1) % 1_000_000).padStart(6, '0');
      expect(await saveSchedule(ALWAYS, NOW, wrong)).toEqual({ status: 'wrong-code' });
      expect(await saveSchedule(ALWAYS, NOW)).toEqual({ status: 'wrong-code' });
      expect(await loadScheduleState(NOW)).toEqual({ schedule: EVENINGS, pending: null });
    });

    it('予約中に狭める変更を保存すると、予約中の変更は破棄される', async () => {
      await browser.storage.sync.set({
        pendingChange: pendingAt(ALWAYS, new Date(NOW.getTime() + HOUR)),
      });
      expect(await saveSchedule(NEVER, NOW)).toEqual({ status: 'applied' });
      expect(await browser.storage.sync.get(null)).toEqual({ schedule: NEVER, totpSecret: SECRET });
    });

    it('予約中に広げる変更を保存すると、新しい変更で予約し直す', async () => {
      await browser.storage.sync.set({
        pendingChange: pendingAt(ALWAYS, new Date(NOW.getTime() + HOUR)),
      });
      const next = [ALWAYS[0], ...EVENINGS.slice(1)] as unknown as WeeklySchedule;
      await saveSchedule(next, NOW, await codeAt(NOW));
      expect((await loadScheduleState(NOW)).pending?.schedule).toEqual(next);
      // 1時間後に反映されるはずだった変更は、もう反映されない
      expect((await loadScheduleState(new Date(NOW.getTime() + 2 * HOUR))).schedule).toEqual(
        EVENINGS,
      );
    });

    it('反映済みの変更は、次の変更を予約しても残る', async () => {
      const applied = [EVENINGS[0], ...ALWAYS.slice(1)] as unknown as WeeklySchedule;
      await browser.storage.sync.set({ pendingChange: pendingAt(applied, NOW) });
      await saveSchedule(ALWAYS, NOW, await codeAt(NOW));
      expect((await loadScheduleState(NOW)).schedule).toEqual(applied);
    });

    it('反映済みの変更と比べて、広げるか狭めるかを決める', async () => {
      // 保存されている EVENINGS と比べると広げる変更だが、反映済みの ALWAYS と比べると狭める変更
      await browser.storage.sync.set({ pendingChange: pendingAt(ALWAYS, NOW) });
      const next = [EVENINGS[0], ...ALWAYS.slice(1)] as unknown as WeeklySchedule;
      expect(await saveSchedule(next, NOW)).toEqual({ status: 'applied' });
    });
  });
});

describe('cancelPendingChange', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('予約中の変更を取り消す', async () => {
    await browser.storage.sync.set({
      schedule: EVENINGS,
      pendingChange: pendingAt(ALWAYS, new Date(NOW.getTime() + HOUR)),
    });
    await cancelPendingChange(NOW);
    expect(await loadScheduleState(new Date(NOW.getTime() + 2 * HOUR))).toEqual({
      schedule: EVENINGS,
      pending: null,
    });
  });

  it('取り消す前に反映済みになっていたら、反映されたまま残す', async () => {
    await browser.storage.sync.set({ schedule: EVENINGS, pendingChange: pendingAt(ALWAYS, NOW) });
    await cancelPendingChange(NOW);
    expect(await browser.storage.sync.get(null)).toEqual({ schedule: ALWAYS });
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

  it('予約中の変更が反映されたあとの予約枠も考えて、次に見られる時刻を出す', async () => {
    await browser.storage.sync.set({
      schedule: NEVER,
      pendingChange: pendingAt(ALWAYS, new Date(2026, 10, 2, 15, 0)),
    });
    expect(await loadVerdict(NOW)).toEqual({
      allowed: false,
      reason: 'outside-window',
      nextAllowedAt: new Date(2026, 10, 2, 15, 0),
    });
  });

  it('全端末の今日の視聴時間で予算を判定する', async () => {
    const budget = Array(7).fill({ type: 'budget', budgetMinutes: 60 });
    await browser.storage.sync.set({
      schedule: budget,
      'usage_2026-11-02_a': 40 * 60 * 1000,
      'usage_2026-11-02_b': 20 * 60 * 1000,
    });
    expect(await loadVerdict(new Date(2026, 10, 2, 12, 0))).toEqual({
      allowed: false,
      reason: 'budget-exhausted',
      nextAllowedAt: new Date(2026, 10, 3, 4, 0),
    });
  });
});
