import type { Browser } from 'wxt/browser';
import { BLOCKED_DOMAINS, EXCLUDED_DOMAINS } from '../core/youtube';

export const BLOCK_RULE_ID = 1;

/**
 * YouTubeのページ（他サイトへの埋め込みを含む）をブロック画面に置き換えるルール。
 * 元のURLは、ブロック画面のURLの # 以降に入れて渡す（見られる時間になったら戻れるように）。
 */
export function buildBlockRule(blockedPageUrl: string): Browser.declarativeNetRequest.Rule {
  return {
    id: BLOCK_RULE_ID,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: { regexSubstitution: `${blockedPageUrl}#\\0` },
    },
    condition: {
      regexFilter: '^https?://.*',
      requestDomains: [...BLOCKED_DOMAINS],
      excludedRequestDomains: [...EXCLUDED_DOMAINS],
      resourceTypes: ['main_frame', 'sub_frame'],
    },
  };
}
