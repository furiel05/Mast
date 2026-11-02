import path from 'node:path';
import { type BrowserContext, test as base, chromium } from '@playwright/test';

const extensionPath = path.resolve(import.meta.dirname, '../.output/chrome-mv3');

/** 偽のYouTubeページ。本物のYouTubeには接続しない */
const FAKE_PAGES: Record<string, string> = {
  'https://www.youtube.com/': '<!doctype html><title>Fake YouTube</title><h1>Fake YouTube</h1>',
  'https://www.youtube.com/embed/': '<!doctype html><title>Fake embed</title><p>Fake embed</p>',
  'https://example.com/':
    '<!doctype html><title>Other site</title><iframe src="https://www.youtube.com/embed/test"></iframe>',
};

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
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

  extensionId: async ({ context }, use) => {
    const serviceWorker =
      context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(new URL(serviceWorker.url()).host);
  },
});

export const expect = test.expect;
