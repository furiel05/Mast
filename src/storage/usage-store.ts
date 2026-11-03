import { browser } from 'wxt/browser';
import { DAY_START_MINUTE, timeAt, toLogicalDay } from '../core/day';
import { type PlaybackState, parsePlayback, type Transition } from '../core/playback';
import { splitByDay, staleUsageKeys, sumUsage, usageKey, usageMsOf } from '../core/usage';
import { getOrCreateDeviceId } from './device-id';

/**
 * この端末の再生状態を保存する storage.session のキー。
 * Service Worker が止まっても残り、Chrome を閉じると消える
 */
export const PLAYBACK_KEY = 'playback';

export async function loadPlayback(): Promise<PlaybackState> {
  const stored = await browser.storage.session.get(PLAYBACK_KEY);
  return parsePlayback(stored[PLAYBACK_KEY]);
}

/** 再生状態の変化を保存し、確定した視聴時間をこの端末の記録に足す */
export async function applyTransition({ state, watched }: Transition): Promise<void> {
  if (watched !== null) {
    await addUsage(new Date(watched.from), new Date(watched.to));
  }
  await browser.storage.session.set({ [PLAYBACK_KEY]: state });
}

/** from〜to の視聴時間を、この端末の日ごとの記録に足す */
async function addUsage(from: Date, to: Date): Promise<void> {
  const parts = splitByDay(from, to);
  if (parts.length === 0) {
    return;
  }
  const deviceId = await getOrCreateDeviceId();
  const entries = parts.map(({ date, ms }) => ({ key: usageKey(date, deviceId), ms }));
  const stored = await browser.storage.sync.get(entries.map(({ key }) => key));
  await browser.storage.sync.set(
    Object.fromEntries(entries.map(({ key, ms }) => [key, usageMsOf(stored[key]) + ms])),
  );
}

/**
 * 今日（4時区切り）の視聴時間。全端末の記録に、この端末でまだ記録していない再生中の分を足す。
 * 再生中の分は、記録に書き込むのが1分ごとなので、その間も予算の残りを正しく出すために足す
 */
export async function loadUsedMs(now: Date): Promise<number> {
  const today = toLogicalDay(now).date;
  const [items, playback] = await Promise.all([browser.storage.sync.get(null), loadPlayback()]);
  const todayStart = timeAt(today, DAY_START_MINUTE).getTime();
  const pendingMs =
    playback.since === null ? 0 : Math.max(0, now.getTime() - Math.max(playback.since, todayStart));
  return sumUsage(items, today) + pendingMs;
}

/** 古い視聴時間の記録を消す（storage.sync は512件までしか保存できないため） */
export async function pruneUsage(now: Date): Promise<void> {
  const items = await browser.storage.sync.get(null);
  const stale = staleUsageKeys(Object.keys(items), toLogicalDay(now).date);
  if (stale.length > 0) {
    await browser.storage.sync.remove(stale);
  }
}
