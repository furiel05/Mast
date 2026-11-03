import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { isReloadMessage } from '../messages';

export default defineContentScript({
  matches: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'],
  // ブロックの対象外にしているドメイン（core/youtube.ts の EXCLUDED_DOMAINS）
  excludeMatches: ['*://music.youtube.com/*', '*://accounts.youtube.com/*'],
  // 他サイトに埋め込まれたYouTube（iframe）でも動かすため
  allFrames: true,
  main() {
    // E2Eテストから動作を確認するための目印
    document.documentElement.dataset.mast = 'loaded';

    // 見られる時間が終わったら読み込み直す。ブロックがオンになっているので、ブロック画面に置き換わる
    browser.runtime.onMessage.addListener((message) => {
      if (isReloadMessage(message)) {
        location.reload();
      }
    });
  },
});
