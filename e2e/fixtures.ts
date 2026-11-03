import path from 'node:path';
import { type BrowserContext, test as base, chromium, type Worker } from '@playwright/test';
import type { browser } from 'wxt/browser';

// Service Worker の中で動かすコードから使う
declare const chrome: typeof browser;

const extensionPath = path.resolve(import.meta.dirname, '../.output/chrome-mv3');

/** 偽のYouTubeページ。本物のYouTubeには接続しない */
const FAKE_PAGES: Record<string, string> = {
  'https://www.youtube.com/': '<!doctype html><title>Fake YouTube</title><h1>Fake YouTube</h1>',
  'https://www.youtube.com/embed/': '<!doctype html><title>Fake embed</title><p>Fake embed</p>',
  'https://music.youtube.com/': '<!doctype html><title>Fake Music</title><h1>Fake Music</h1>',
  'https://example.com/':
    '<!doctype html><title>Other site</title><h1>Other site</h1><iframe src="https://www.youtube.com/embed/test"></iframe>',
};

/** 曜日ごとのルール。src/core/schedule.ts の DayRule と同じ形 */
type DayRule = { type: 'none' } | { type: 'window'; window: { start: number; end: number } };

const NONE: DayRule = { type: 'none' };

/** 1日中見られる予約枠（朝4時〜翌朝4時） */
export const ALLOW_ALL: DayRule[] = Array(7).fill({
  type: 'window',
  window: { start: 4 * 60, end: 28 * 60 },
});

/** まったく見られない予約枠 */
export const BLOCK_ALL: DayRule[] = Array(7).fill(NONE);

type Fixtures = {
  context: BrowserContext;
  serviceWorker: Worker;
  extensionId: string;
  /** 予約枠を保存し、Service Worker の判定が反映されるまで待つ */
  setSchedule: (schedule: DayRule[], expectBlocking: boolean) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright のフィクスチャは第1引数の分割代入が必須
  context: async ({}, use) => {
    // 正規版の Google Chrome は --load-extension を受け付けないため、Playwright 同梱の Chromium を使う
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });

    // 外部への通信はすべて遮断し、FAKE_PAGES に定義したURLだけ偽のページを返す
    await context.route(/^https?:\/\//, async (route) => {
      const url = route.request().url();
      const prefix = Object.keys(FAKE_PAGES)
        .filter((p) => url.startsWith(p))
        .sort((a, b) => b.length - a.length)[0];
      if (prefix === undefined) {
        await route.abort();
        return;
      }
      await route.fulfill({ contentType: 'text/html', body: FAKE_PAGES[prefix] });
    });

    await use(context);
    await context.close();
  },

  serviceWorker: async ({ context }, use) => {
    await use(context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker')));
  },

  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },

  setSchedule: async ({ serviceWorker }, use) => {
    await use(async (schedule, expectBlocking) => {
      const savedAt = await serviceWorker.evaluate(async (value) => {
        await chrome.storage.sync.set({ schedule: value });
        return Date.now();
      }, schedule);
      // 保存より後に判定を終えていて、ブロックの状態が期待どおりになるまで待つ。
      // 保存前に始まった判定（起動時の判定など）の結果を、反映済みと取り違えないため
      await expect
        .poll(() =>
          serviceWorker.evaluate(async (since) => {
            const { lastEvaluatedAt } = await chrome.storage.session.get('lastEvaluatedAt');
            const rules = await chrome.declarativeNetRequest.getDynamicRules();
            return Number(lastEvaluatedAt ?? 0) >= since ? rules.length > 0 : 'not yet';
          }, savedAt),
        )
        .toBe(expectBlocking);
    });
  },
});

export const expect = test.expect;
