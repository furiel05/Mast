import { browser } from 'wxt/browser';
import { checkpoint, setFramePlaying, withFrames } from '../core/playback';
import { QUERY_PLAYBACK_MESSAGE } from '../messages';
import { applyTransition, loadPlayback } from '../storage/usage-store';

/** 再生状態で使うフレームの表し方 */
export function frameKey(tabId: number, frameId: number): string {
  return `${tabId}:${frameId}`;
}

/** コンテンツスクリプトから「再生が始まった・止まった」と知らされたとき */
export async function updateFramePlaying(frame: string, playing: boolean): Promise<void> {
  await applyTransition(setFramePlaying(await loadPlayback(), frame, playing, Date.now()));
}

/**
 * ここまでの視聴時間を記録に書き込む。再生中は1分ごとに呼ぶ。
 * タブを閉じたときなどは停止の知らせが届かないことがあるので、再生中のフレームが本当にまだ再生しているかも確かめる
 */
export async function checkpointPlayback(): Promise<void> {
  const state = await loadPlayback();
  const results = await Promise.all(state.frames.map(isStillPlaying));
  const frames = state.frames.filter((_, i) => results[i]);
  const now = Date.now();
  await applyTransition(
    frames.length > 0 ? checkpoint({ ...state, frames }, now) : withFrames(state, [], now),
  );
}

/** 再生中の分を記録に書き込み、数えるのをやめる。ブロックしたときに呼ぶ */
export async function stopAllPlayback(): Promise<void> {
  await applyTransition(withFrames(await loadPlayback(), [], Date.now()));
}

async function isStillPlaying(frame: string): Promise<boolean> {
  // frameKey で作った "タブID:フレームID" を戻す
  const [tabId, frameId] = frame.split(':').map(Number) as [number, number];
  try {
    return (await browser.tabs.sendMessage(tabId, QUERY_PLAYBACK_MESSAGE, { frameId })) === true;
  } catch {
    // タブやフレームがもうない
    return false;
  }
}
