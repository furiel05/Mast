/**
 * assets/icon.svg から、拡張機能のアイコン（public/icon/<サイズ>.png）を作る。
 * アイコンを変えたら `npm run icons` で作り直し、PNG もコミットする
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

/** ツールバー（16・32）、拡張機能の管理画面（48）、Chrome Web Store とインストール時（128） */
const SIZES = [16, 32, 48, 128];

const root = path.resolve(import.meta.dirname, '..');
const svg = await readFile(path.join(root, 'assets/icon.svg'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of SIZES) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.locator('svg').screenshot({
    path: path.join(root, `public/icon/${size}.png`),
    omitBackground: true,
  });
}
await browser.close();
