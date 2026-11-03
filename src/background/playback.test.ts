import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { IDLE } from '../core/playback';
import { getOrCreateDeviceId } from '../storage/device-id';
import { applyTransition, loadPlayback } from '../storage/usage-store';
import { checkpointPlayback, stopAllPlayback, updateFramePlaying } from './playback';

const MINUTE = 60 * 1000;
const START = new Date(2026, 10, 2, 20, 0);

describe('再生状態の記録', () => {
  let usageKey: string;

  beforeEach(async () => {
    fakeBrowser.reset();
    vi.useFakeTimers({ toFake: ['Date'], now: START });
    usageKey = `usage_2026-11-02_${await getOrCreateDeviceId()}`;
    return () => vi.useRealTimers();
  });

  it('再生が始まってから止まるまでの時間を記録する', async () => {
    await updateFramePlaying('1:0', true);
    vi.setSystemTime(START.getTime() + 3 * MINUTE);
    await updateFramePlaying('1:0', false);

    expect(await browser.storage.sync.get(usageKey)).toEqual({ [usageKey]: 3 * MINUTE });
    expect(await loadPlayback()).toEqual(IDLE);
  });

  it('1分ごとの確認で、まだ再生中のフレームはそのまま数え続ける', async () => {
    vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue(true as never);
    await updateFramePlaying('1:0', true);
    vi.setSystemTime(START.getTime() + MINUTE);

    await checkpointPlayback();

    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      { type: 'mast:query-playback' },
      { frameId: 0 },
    );
    expect(await browser.storage.sync.get(usageKey)).toEqual({ [usageKey]: MINUTE });
    expect(await loadPlayback()).toEqual({ frames: ['1:0'], since: START.getTime() + MINUTE });
  });

  it('1分ごとの確認で、答えないフレーム（閉じたタブなど）は再生をやめたとみなす', async () => {
    vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(async (tabId) => {
      if (tabId === 2) {
        throw new Error('Could not establish connection');
      }
      return true;
    });
    await updateFramePlaying('1:0', true);
    await updateFramePlaying('2:0', true);
    vi.setSystemTime(START.getTime() + MINUTE);

    await checkpointPlayback();

    expect(await loadPlayback()).toEqual({ frames: ['1:0'], since: START.getTime() + MINUTE });
  });

  it('1分ごとの確認で、どのフレームも再生していなければ数えるのをやめる', async () => {
    vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue(false as never);
    await updateFramePlaying('1:0', true);
    vi.setSystemTime(START.getTime() + 30 * 1000);

    await checkpointPlayback();

    expect(await browser.storage.sync.get(usageKey)).toEqual({ [usageKey]: 30 * 1000 });
    expect(await loadPlayback()).toEqual(IDLE);
  });

  it('ブロックしたら、再生中だった分を記録して数えるのをやめる', async () => {
    await applyTransition({
      state: { frames: ['1:0', '2:0'], since: START.getTime() },
      watched: null,
    });
    vi.setSystemTime(START.getTime() + 2 * MINUTE);

    await stopAllPlayback();

    expect(await browser.storage.sync.get(usageKey)).toEqual({ [usageKey]: 2 * MINUTE });
    expect(await loadPlayback()).toEqual(IDLE);
  });
});
