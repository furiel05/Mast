import { browser } from 'wxt/browser';
import { RELOAD_MESSAGE } from '../messages';
import { loadVerdict } from '../storage/schedule-store';
import { BLOCK_RULE_ID, buildBlockRule } from './block-rule';

/** 枠の終わり・次の枠の始まりに判定し直すためのアラーム */
export const REEVALUATE_ALARM = 'mast-reevaluate';

/** 時計の変更などでアラームがずれても、1分以内に正しい状態に戻すためのアラーム */
export const SAFETY_ALARM = 'mast-safety';

/** storage.session に保存する、最後に判定を終えた時刻のキー */
export const LAST_EVALUATED_KEY = 'lastEvaluatedAt';

let queue: Promise<void> = Promise.resolve();

/**
 * 今見てよいかを判定し、ブロックのオン・オフとアラームを更新する。
 * 同時に呼ばれても、古い設定で判定した結果が後から上書きしないよう、1つずつ順番に実行する。
 */
export function reevaluate(): Promise<void> {
  queue = queue.then(run, run);
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
  if (!verdict.allowed && !wasBlocked) {
    // 見られる時間に開いていたYouTubeは、読み込み直させるとブロック画面に置き換わる
    await reloadYouTubeFrames();
  }

  await browser.alarms.clear(REEVALUATE_ALARM);
  const next = verdict.allowed ? verdict.allowedUntil : verdict.nextAllowedAt;
  if (next !== null) {
    await browser.alarms.create(REEVALUATE_ALARM, { when: next.getTime() });
  }

  // 最後に判定を終えた時刻。動作確認やE2Eテストで、判定が反映されたかを確かめるのに使う
  await browser.storage.session.set({ [LAST_EVALUATED_KEY]: Date.now() });
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
