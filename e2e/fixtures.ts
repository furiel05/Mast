import { createHmac } from 'node:crypto';
import path from 'node:path';
import { type BrowserContext, test as base, chromium, type Worker } from '@playwright/test';
import type { browser } from 'wxt/browser';

// Service Worker の中で動かすコードから使う
declare const chrome: typeof browser;

const extensionPath = path.resolve(import.meta.dirname, '../.output/chrome-mv3');

/**
 * 動画を再生できる偽のYouTubeページ。#main は通常のプレーヤー、#preview はサムネイルのプレビューを模したもの。
 * 動画ファイルを用意しなくてよいよう、canvas の映像を流す
 */
const FAKE_VIDEO_PAGE = `<!doctype html><title>Fake video</title>
<video id="main" muted></video>
<div id="video-preview"><video id="preview" muted></video></div>
<script>
  for (const video of document.querySelectorAll('video')) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    setInterval(() => context.fillRect(0, 0, Math.random() * 300, 150), 100);
    video.srcObject = canvas.captureStream(10);
  }
</script>`;

/** 偽のYouTubeページ。本物のYouTubeには接続しない */
const FAKE_PAGES: Record<string, string> = {
  'https://www.youtube.com/': '<!doctype html><title>Fake YouTube</title><h1>Fake YouTube</h1>',
  'https://www.youtube.com/embed/': '<!doctype html><title>Fake embed</title><p>Fake embed</p>',
  'https://www.youtube.com/watch?v=video': FAKE_VIDEO_PAGE,
  'https://music.youtube.com/': '<!doctype html><title>Fake Music</title><h1>Fake Music</h1>',
  'https://example.com/':
    '<!doctype html><title>Other site</title><h1>Other site</h1><iframe src="https://www.youtube.com/embed/test"></iframe>',
};

/** 曜日ごとのルール。src/core/schedule.ts の DayRule と同じ形 */
type DayRule =
  | { type: 'none' }
  | { type: 'window'; window: { start: number; end: number } }
  | { type: 'budget'; budgetMinutes: number };

const NONE: DayRule = { type: 'none' };

/** 1日中見られる予約枠（朝4時〜翌朝4時） */
export const ALLOW_ALL: DayRule[] = Array(7).fill({
  type: 'window',
  window: { start: 4 * 60, end: 28 * 60 },
});

/** まったく見られない予約枠 */
export const BLOCK_ALL: DayRule[] = Array(7).fill(NONE);

/** 毎日1分まで見られる予約枠 */
export const BUDGET_1_MINUTE: DayRule[] = Array(7).fill({ type: 'budget', budgetMinutes: 1 });

/** 4時区切りで見た今日の曜日（src/core/day.ts）。0 が日曜 */
export function logicalWeekday(): number {
  const now = new Date();
  return new Date(now.getTime() - (now.getHours() < 4 ? 24 * 60 * 60 * 1000 : 0)).getDay();
}

/** 承認コードの秘密鍵（Base32）。RFC 6238 のテストで使う "12345678901234567890" */
export const TOTP_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

/**
 * 認証アプリの代わりに、今のTOTPコードを作る。
 * 拡張機能の実装（src/core/totp.ts）を使わず、Node.js の crypto で別に計算して突き合わせる
 */
export function totpCode(secretBase32: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secretBase32.replace(/\s/g, '')]
    .map((char) => alphabet.indexOf(char).toString(2).padStart(5, '0'))
    .join('');
  const key = Buffer.from(bits.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) ?? []);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = (hmac.at(-1) ?? 0) & 0x0f;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** E2E テストで使う端末ID。視聴時間の記録のキーを決めるため、拡張機能が作る前に保存しておく */
const DEVICE_ID = 'e2e-device';

type Fixtures = {
  context: BrowserContext;
  serviceWorker: Worker;
  extensionId: string;
  /** 予約枠を保存し、Service Worker の判定が反映されるまで待つ */
  setSchedule: (schedule: DayRule[], expectBlocking: boolean) => Promise<void>;
  /** 予約枠の保存より後に判定を終え、ブロックの状態が期待どおりになるまで待つ */
  waitForBlocking: (expectBlocking: boolean, since: number) => Promise<void>;
  /** この端末の今日（4時区切り）の視聴時間の記録を書き換える */
  setTodayUsage: (ms: number) => Promise<void>;
  /** この端末の視聴時間の記録の合計（ミリ秒） */
  recordedUsage: () => Promise<number>;
  /** 承認コードの初回セットアップを済ませた状態にする。秘密鍵は TOTP_SECRET */
  registerTotp: () => Promise<void>;
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
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await worker.evaluate((id) => chrome.storage.local.set({ deviceId: id }), DEVICE_ID);
    // インストールした直後に、拡張機能が設定画面を開く（background.ts）。テストが同じ設定画面へ
    // 移動するのとぶつかって移動が中断されないよう、開き終わるのを待ってからテストを始める
    const optionsUrl = new URL('/options.html', worker.url()).href;
    await expect.poll(() => context.pages().some((page) => page.url() === optionsUrl)).toBe(true);
    await use(worker);
  },

  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },

  waitForBlocking: async ({ serviceWorker }, use) => {
    await use(async (expectBlocking, since) => {
      // 保存前に始まった判定（起動時の判定など）の結果を、反映済みと取り違えないため
      await expect
        .poll(() =>
          serviceWorker.evaluate(async (since) => {
            const { lastEvaluatedAt } = await chrome.storage.session.get('lastEvaluatedAt');
            const rules = await chrome.declarativeNetRequest.getDynamicRules();
            return Number(lastEvaluatedAt ?? 0) >= since ? rules.length > 0 : 'not yet';
          }, since),
        )
        .toBe(expectBlocking);
    });
  },

  setSchedule: async ({ serviceWorker, waitForBlocking }, use) => {
    await use(async (schedule, expectBlocking) => {
      const savedAt = await serviceWorker.evaluate(async (value) => {
        await chrome.storage.sync.set({ schedule: value });
        return Date.now();
      }, schedule);
      await waitForBlocking(expectBlocking, savedAt);
    });
  },

  setTodayUsage: async ({ serviceWorker }, use) => {
    await use(async (ms) => {
      await serviceWorker.evaluate(
        async ({ ms, deviceId }) => {
          // 4時より前は前の日として扱う（src/core/day.ts）
          const now = new Date();
          const logical = new Date(now.getTime() - (now.getHours() < 4 ? 24 * 60 * 60 * 1000 : 0));
          const mm = String(logical.getMonth() + 1).padStart(2, '0');
          const dd = String(logical.getDate()).padStart(2, '0');
          const key = `usage_${logical.getFullYear()}-${mm}-${dd}_${deviceId}`;
          await chrome.storage.sync.set({ [key]: ms });
        },
        { ms, deviceId: DEVICE_ID },
      );
    });
  },

  registerTotp: async ({ serviceWorker }, use) => {
    await use(async () => {
      await serviceWorker.evaluate(
        (secret) => chrome.storage.sync.set({ totpSecret: secret }),
        TOTP_SECRET,
      );
    });
  },

  recordedUsage: async ({ serviceWorker }, use) => {
    await use(() =>
      serviceWorker.evaluate(async (deviceId) => {
        const items = await chrome.storage.sync.get(null);
        return Object.entries(items)
          .filter(([key]) => key.startsWith('usage_') && key.endsWith(`_${deviceId}`))
          .reduce((sum, [, value]) => sum + Number(value), 0);
      }, DEVICE_ID),
    );
  },
});

export const expect = test.expect;
