import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  // 設定画面などの見た目は React で描く
  modules: ['@wxt-dev/module-react'],
  // 自動インポートは使わず、どこから来た関数かをimport文で明示する
  imports: false,
  manifest: {
    // Chrome Web Store の名前にもなる。YouTube 向けであることは名前の後ろで補足する（docs/spec.md「概要と目的」）
    name: 'Mast – Watch-time limits for YouTube',
    short_name: 'Mast',
    description:
      'YouTube を見てよい時間を予約枠の中だけにします。枠を広げる変更には、認証アプリのコードと24時間の待ちが必要です。',
    permissions: ['storage', 'alarms', 'declarativeNetRequest'],
    // ツールバーのアイコンをクリックしたら設定画面を開く（background.ts）
    action: { default_title: 'Mast の設定を開く' },
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
