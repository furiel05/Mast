import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { IDLE } from '../core/playback';
import { getOrCreateDeviceId } from './device-id';
import { applyTransition, loadPlayback, loadUsedMs, pruneUsage } from './usage-store';

const MINUTE = 60 * 1000;

describe('applyTransition', () => {
  let deviceId: string;

  beforeEach(async () => {
    fakeBrowser.reset();
    deviceId = await getOrCreateDeviceId();
  });

  it('再生状態を storage.session に保存する', async () => {
    const state = { frames: ['1:0'], since: 1000 };
    await applyTransition({ state, watched: null });

    expect(await loadPlayback()).toEqual(state);
    expect(await browser.storage.sync.get(null)).toEqual({});
  });

  it('確定した視聴時間を、この端末のその日の記録に足す', async () => {
    await browser.storage.sync.set({ [`usage_2026-11-02_${deviceId}`]: 5 * MINUTE });
    const from = new Date(2026, 10, 2, 20, 0).getTime();

    await applyTransition({ state: IDLE, watched: { from, to: from + 10 * MINUTE } });

    expect(await browser.storage.sync.get(null)).toEqual({
      [`usage_2026-11-02_${deviceId}`]: 15 * MINUTE,
    });
  });

  it('4時をまたいだ視聴時間は、前の日と次の日の記録に分けて足す', async () => {
    const from = new Date(2026, 10, 3, 3, 55).getTime();

    await applyTransition({ state: IDLE, watched: { from, to: from + 10 * MINUTE } });

    expect(await browser.storage.sync.get(null)).toEqual({
      [`usage_2026-11-02_${deviceId}`]: 5 * MINUTE,
      [`usage_2026-11-03_${deviceId}`]: 5 * MINUTE,
    });
  });

  it('ほかの端末の記録には書き込まない', async () => {
    await browser.storage.sync.set({ 'usage_2026-11-02_other': 7 * MINUTE });
    const from = new Date(2026, 10, 2, 20, 0).getTime();

    await applyTransition({ state: IDLE, watched: { from, to: from + MINUTE } });

    expect(await browser.storage.sync.get('usage_2026-11-02_other')).toEqual({
      'usage_2026-11-02_other': 7 * MINUTE,
    });
  });
});

describe('loadUsedMs', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('今日の記録を全端末分合計する', async () => {
    await browser.storage.sync.set({
      'usage_2026-11-02_a': 10 * MINUTE,
      'usage_2026-11-02_b': 20 * MINUTE,
      'usage_2026-11-01_a': 60 * MINUTE,
    });
    expect(await loadUsedMs(new Date(2026, 10, 2, 21, 0))).toBe(30 * MINUTE);
  });

  it('深夜（4時前）は前の日の記録を数える', async () => {
    await browser.storage.sync.set({ 'usage_2026-11-02_a': 10 * MINUTE });
    expect(await loadUsedMs(new Date(2026, 10, 3, 1, 0))).toBe(10 * MINUTE);
  });

  it('再生中なら、まだ記録していない分も足す', async () => {
    await browser.storage.sync.set({ 'usage_2026-11-02_a': 10 * MINUTE });
    const since = new Date(2026, 10, 2, 21, 0).getTime();
    await applyTransition({ state: { frames: ['1:0'], since }, watched: null });

    expect(await loadUsedMs(new Date(since + 3 * MINUTE))).toBe(13 * MINUTE);
  });

  it('4時より前から再生中なら、4時からの分だけを今日に足す', async () => {
    const since = new Date(2026, 10, 3, 3, 50).getTime();
    await applyTransition({ state: { frames: ['1:0'], since }, watched: null });

    expect(await loadUsedMs(new Date(2026, 10, 3, 4, 5))).toBe(5 * MINUTE);
  });
});

describe('pruneUsage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('7日より前の記録だけを消す', async () => {
    const schedule = [{ type: 'none' }];
    await browser.storage.sync.set({
      'usage_2026-11-02_a': 1,
      'usage_2026-11-03_a': 2,
      'usage_2026-11-10_b': 3,
      schedule,
    });

    await pruneUsage(new Date(2026, 10, 10, 12, 0));

    expect(await browser.storage.sync.get(null)).toEqual({
      'usage_2026-11-03_a': 2,
      'usage_2026-11-10_b': 3,
      schedule,
    });
  });
});
