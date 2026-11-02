import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  // 設定画面などの見た目は React で描く
  modules: ['@wxt-dev/module-react'],
  // 自動インポートは使わず、どこから来た関数かをimport文で明示する
  imports: false,
  manifest: {
    name: 'Mast',
    description: 'Watch-time limits for YouTube',
    permissions: ['storage', 'alarms', 'declarativeNetRequest'],
    // ブロック画面への転送（declarativeNetRequest の redirect）に必要
    host_permissions: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*', '*://youtu.be/*'],
    web_accessible_resources: [
      {
        // YouTubeのページや、YouTubeを埋め込んだ他サイトから転送されてくるため
        resources: ['blocked.html'],
        matches: ['<all_urls>'],
      },
    ],
  },
});
