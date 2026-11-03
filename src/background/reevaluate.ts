import { browser } from 'wxt/browser';
import type { Verdict } from '../core/schedule';
import { RELOAD_MESSAGE } from '../messages';
import { loadVerdict } from '../storage/schedule-store';
import { loadPlayback } from '../storage/usage-store';
import { BLOCK_RULE_ID, buildBlockRule } from './block-rule';
import { stopAllPlayback } from './playback';

/** 枠の終わり・予算を使い切る時刻・次の枠の始まりに判定し直すためのアラーム */
export const REEVALUATE_ALARM = 'mast-reevaluate';

/**
 * 1分ごとのアラーム。再生中の視聴時間の書き込みと、他の端末で使った予算の反映のほか、
 * 時計の変更などでアラームがずれても、1分以内に正しい状態に戻すために使う
 */
export const SAFETY_ALARM = 'mast-safety';

/** storage.session に保存する、最後に判定を終えた時刻のキー */
export const LAST_EVALUATED_KEY = 'lastEvaluatedAt';

let queue: Promise<void> = Promise.resolve();

/**
 * 今見てよいかを判定し、ブロックのオン・オフとアラームを更新する。
 * 同時に呼ばれても、古い状態で判定した結果が後から上書きしないよう、1つずつ順番に実行する。
 *
 * @param prepare 判定の前に、同じ順番待ちの中で行う処理（再生状態の更新など）
 */
export function reevaluate(prepare?: () => Promise<void>): Promise<void> {
  const task = async () => {
    await prepare?.();
    await run();
  };
  queue = queue.then(task, task);
  return queue;
}

async function run(): Promise<void> {
  const now = new Date();
  const verdict = await loadVerdict(now);
  const wasBlocked = await isBlocking();

  await browser.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [BLOCK_RULE_ID],
    addRules: verdict.allowed ? [] : [buildBlockRule(browser.runtime.getURL('/blocked.html'))],
  });
  if (!verdict.allowed) {
    // ブロック中は再生できないので、再生中だった分を記録して数えるのをやめる
    await stopAllPlayback();
    if (!wasBlocked) {
      // 見られる時間に開いていたYouTubeは、読み込み直させるとブロック画面に置き換わる
      await reloadYouTubeFrames();
    }
  }

  await browser.alarms.clear(REEVALUATE_ALARM);
  const next = verdict.allowed ? await allowedEnd(verdict, now) : verdict.nextAllowedAt;
  if (next !== null) {
    await browser.alarms.create(REEVALUATE_ALARM, { when: next.getTime() });
  }

  // 最後に判定を終えた時刻。動作確認やE2Eテストで、判定が反映されたかを確かめるのに使う
  await browser.storage.session.set({ [LAST_EVALUATED_KEY]: Date.now() });
}

/** 見られる状態が終わる時刻。再生中なら、枠の終わりより先に予算を使い切ることがある */
async function allowedEnd(verdict: Verdict & { allowed: true }, now: Date): Promise<Date> {
  if (verdict.remainingMs === null || (await loadPlayback()).since === null) {
    return verdict.allowedUntil;
  }
  const exhaustedAt = now.getTime() + verdict.remainingMs;
  return new Date(Math.min(exhaustedAt, verdict.allowedUntil.getTime()));
}

async function isBlocking(): Promise<boolean> {
  const rules = await browser.declarativeNetRequest.getDynamicRules();
  return rules.some((rule) => rule.id === BLOCK_RULE_ID);
}

async function reloadYouTubeFrames(): Promise<void> {
  // 他サイトに埋め込まれたYouTubeもあるので、すべてのタブに送る。
  // 受け取るのはYouTubeのフレームで動いているコンテンツスクリプトだけ
  const tabs = await browser.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id === undefined) {
        return;
      }
      try {
        await browser.tabs.sendMessage(tab.id, RELOAD_MESSAGE);
      } catch {
        // コンテンツスクリプトがいないタブ（YouTube以外）では失敗するが、問題ない
      }
    }),
  );
}
