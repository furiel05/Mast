/**
 * Chrome Web Store に載せる画像（スクリーンショットとプロモーション タイル）を .output/store/ に作る。
 * ビルドした拡張機能（.output/chrome-mv3）を読み込んで、実際の画面を撮る。先に `npm run build` が必要
 */
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import type { browser } from 'wxt/browser';

// Service Worker の中で動かすコードから使う
declare const chrome: typeof browser;

const root = path.resolve(import.meta.dirname, '..');
const extensionPath = path.join(root, '.output/chrome-mv3');
const outDir = path.join(root, '.output/store');

/** スクリーンショットに写す予約枠：平日は20〜23時のうち60分、土日は9〜23時 */
const weekday = { type: 'combined', window: { start: 20 * 60, end: 23 * 60 }, budgetMinutes: 60 };
const weekend = { type: 'window', window: { start: 9 * 60, end: 23 * 60 } };
const SCHEDULE = [weekend, weekday, weekday, weekday, weekday, weekday, weekend];

await mkdir(outDir, { recursive: true });
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});
// 外部には接続しない。YouTube はブロック画面に置き換わるので、通信しなくても撮れる
await context.route(/^https?:\/\//, (route) => route.abort());

const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
const extensionId = new URL(worker.url()).host;
// 承認コードの設定を済ませた状態にして、設定画面のスクリーンショットに予約枠の編集が多く写るようにする。
// 撮影のためだけの使い捨てのブラウザなので、秘密鍵は RFC 6238 のテスト用の値でよい
await worker.evaluate(
  async ({ schedule, secret }) => {
    await chrome.storage.sync.set({ schedule, totpSecret: secret });
  },
  { schedule: SCHEDULE, secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' },
);

const page = await context.newPage();
await page.goto(`chrome-extension://${extensionId}/options.html`);
await page.getByRole('heading', { name: 'Mast 設定' }).waitFor();
await page.screenshot({ path: path.join(outDir, 'screenshot-settings.png') });

// ブロック画面には、いつ撮っても見られない時間で、次に見られる時刻が出るようにする。
// 2日後の曜日の20〜23時だけを予約枠にする（4時区切りで見ても、今日にはならない）
const blockedSchedule = Array(7).fill({ type: 'none' });
blockedSchedule[(new Date().getDay() + 2) % 7] = { type: 'window', window: weekday.window };
await worker.evaluate(async (schedule) => {
  await chrome.storage.sync.set({ schedule });
}, blockedSchedule);
await page.waitForTimeout(1000);
await page.goto('https://www.youtube.com/watch?v=example').catch(() => {});
await page.getByRole('button', { name: 'タブを閉じる' }).waitFor();
await page.screenshot({ path: path.join(outDir, 'screenshot-blocked.png') });

// プロモーション タイル（小）
const icon = await readFile(path.join(root, 'assets/icon.svg'), 'utf8');
await page.setViewportSize({ width: 440, height: 280 });
await page.setContent(`<!doctype html>
<style>
  body { margin: 0; width: 440px; height: 280px; display: flex; align-items: center; gap: 24px;
    padding: 0 36px; box-sizing: border-box; background: #eef2ff;
    font-family: system-ui, -apple-system, "Hiragino Sans", sans-serif; color: #111827; }
  svg { width: 120px; height: 120px; flex: none; }
  h1 { margin: 0; font-size: 40px; }
  p { margin: 8px 0 0; font-size: 17px; line-height: 1.5; }
</style>
${icon}
<div><h1>Mast</h1><p>YouTube は<br>予約した時間だけ</p></div>`);
await page.screenshot({ path: path.join(outDir, 'promo-small.png') });

await context.close();
console.log(`Saved to ${path.relative(root, outDir)}/`);
