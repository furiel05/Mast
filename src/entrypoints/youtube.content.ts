import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { isQueryPlaybackMessage, isReloadMessage, playbackMessage } from '../messages';

/**
 * 再生中でも数えない動画：サムネイルにカーソルを合わせたときのプレビュー（docs/spec.md「視聴時間の数え方」）。
 * それ以外の動画は数える。YouTubeの画面が変わっても、数え漏れが抜け道にならないようにするため
 */
const PREVIEW_SELECTOR = 'ytd-video-preview, #video-preview, #inline-preview-player';

/** 再生中かどうかが変わりうるイベント */
const MEDIA_EVENTS = ['play', 'playing', 'pause', 'ended', 'emptied', 'abort'];

function isWatching(): boolean {
  return Array.from(document.querySelectorAll('video')).some(
    (video) => !video.paused && !video.ended && video.closest(PREVIEW_SELECTOR) === null,
  );
}

export default defineContentScript({
  matches: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'],
  // ブロックの対象外にしているドメイン（core/youtube.ts の EXCLUDED_DOMAINS）
  excludeMatches: ['*://music.youtube.com/*', '*://accounts.youtube.com/*'],
  // 他サイトに埋め込まれたYouTube（iframe）でも動かすため
  allFrames: true,
  main() {
    // E2Eテストから動作を確認するための目印
    document.documentElement.dataset.mast = 'loaded';

    // 再生が始まった・止まったときだけ Service Worker に知らせる。時間は Service Worker が数える
    let playing = false;
    const report = (now: boolean) => {
      if (now === playing) {
        return;
      }
      playing = now;
      // 拡張機能の更新直後など、Service Worker に届かないことがある。1分ごとの確認で正しい状態に戻る
      browser.runtime.sendMessage(playbackMessage(now)).catch(() => {});
    };
    // メディアのイベントは親に伝わらないので、キャプチャで document が受け取る
    for (const type of MEDIA_EVENTS) {
      document.addEventListener(type, () => report(isWatching()), true);
    }
    // タブを閉じたり別のページに移ったりしたとき
    window.addEventListener('pagehide', () => report(false));

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (isReloadMessage(message)) {
        // 見られる時間が終わった。ブロックがオンになっているので、読み込み直すとブロック画面に置き換わる
        location.reload();
      } else if (isQueryPlaybackMessage(message)) {
        // 答えた内容で Service Worker の状態がそろうので、知らせ済みの状態も合わせる
        playing = isWatching();
        sendResponse(playing);
      }
    });
  },
});
