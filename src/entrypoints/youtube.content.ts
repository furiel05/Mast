import { defineContentScript } from 'wxt/utils/define-content-script';

export default defineContentScript({
  matches: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'],
  // 他サイトに埋め込まれたYouTube（iframe）でも動かすため
  allFrames: true,
  main() {
    console.log('[Mast] content script loaded:', location.href);
    // E2Eテストから動作を確認するための目印
    document.documentElement.dataset.mast = 'loaded';
  },
});
