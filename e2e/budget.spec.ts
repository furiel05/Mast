import { ALLOW_ALL, BUDGET_1_MINUTE, expect, test } from './fixtures';

const VIDEO_URL = 'https://www.youtube.com/watch?v=video';

test('再生していた時間を視聴時間として記録する', async ({ page, setSchedule, recordedUsage }) => {
  await setSchedule(ALLOW_ALL, false);
  await page.goto(VIDEO_URL);
  await expect(page.locator('html')).toHaveAttribute('data-mast', 'loaded');

  await page.locator('#main').evaluate((video: HTMLVideoElement) => video.play());
  await page.waitForTimeout(2000);
  await page.locator('#main').evaluate((video: HTMLVideoElement) => video.pause());

  await expect.poll(recordedUsage).toBeGreaterThanOrEqual(1500);
  expect(await recordedUsage()).toBeLessThan(10_000);
});

test('サムネイルのプレビュー再生は数えない', async ({ page, setSchedule, recordedUsage }) => {
  await setSchedule(ALLOW_ALL, false);
  await page.goto(VIDEO_URL);
  await expect(page.locator('html')).toHaveAttribute('data-mast', 'loaded');

  await page.locator('#preview').evaluate((video: HTMLVideoElement) => video.play());
  await page.waitForTimeout(1000);
  await page.locator('#preview').evaluate((video: HTMLVideoElement) => video.pause());
  // 比較のため、続けて通常のプレーヤーを少しだけ再生する。記録されるのはこの分だけになる
  await page.locator('#main').evaluate((video: HTMLVideoElement) => video.play());
  await page.waitForTimeout(300);
  await page.locator('#main').evaluate((video: HTMLVideoElement) => video.pause());

  await expect.poll(recordedUsage).toBeGreaterThan(0);
  expect(await recordedUsage()).toBeLessThan(1000);
});

test('予算を使い切ると、再生中の YouTube がブロック画面に切り替わる', async ({
  page,
  setSchedule,
  setTodayUsage,
}) => {
  // 残り3秒の状態から再生する
  await setTodayUsage(57_000);
  await setSchedule(BUDGET_1_MINUTE, false);
  await page.goto(VIDEO_URL);
  await expect(page.locator('html')).toHaveAttribute('data-mast', 'loaded');

  await page.locator('#main').evaluate((video: HTMLVideoElement) => video.play());

  await expect(page).toHaveURL(/\/blocked\.html#https:\/\/www\.youtube\.com\/watch\?v=video$/, {
    timeout: 15_000,
  });
  await expect(page.getByRole('heading', { name: '今日の視聴時間を使い切りました' })).toBeVisible();
  await expect(page.getByText(/次に見られるのは 明日（.）4:00 から/)).toBeVisible();
});

test('予算を使い切っていたら、YouTube を開いてもブロック画面になる', async ({
  page,
  setSchedule,
  setTodayUsage,
}) => {
  await setTodayUsage(60_000);
  await setSchedule(BUDGET_1_MINUTE, true);
  await page.goto(VIDEO_URL);

  await expect(page.getByRole('heading', { name: '今日の視聴時間を使い切りました' })).toBeVisible();
});
