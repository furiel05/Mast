import { ALLOW_ALL, BLOCK_ALL, expect, test } from './fixtures';

const BLOCKED_PAGE = /\/blocked\.html#https:\/\/www\.youtube\.com\/watch\?v=test$/;

test('見られない時間に YouTube を開くと、ブロック画面になる', async ({ page, setSchedule }) => {
  await setSchedule(BLOCK_ALL, true);
  await page.goto('https://www.youtube.com/watch?v=test');

  await expect(page).toHaveURL(BLOCKED_PAGE);
  await expect(
    page.getByRole('heading', { name: '今はYouTubeを見られない時間です' }),
  ).toBeVisible();
  await expect(page.getByText('見られる時間が設定されていません')).toBeVisible();
});

test('ブロック画面に、次に見られる時刻を表示する', async ({ page, setSchedule }) => {
  // 実行した時刻によらず「今は見られない」状態にするため、2日後の曜日だけ10〜11時に見られるようにする
  const weekday = await page.evaluate(() => {
    const now = new Date();
    // 4時より前は前の日として扱う（src/core/day.ts）
    const logical = new Date(now.getTime() - (now.getHours() < 4 ? 24 * 60 * 60 * 1000 : 0));
    return (logical.getDay() + 2) % 7;
  });
  const schedule = BLOCK_ALL.map((rule, i) =>
    i === weekday ? { type: 'window' as const, window: { start: 10 * 60, end: 11 * 60 } } : rule,
  );
  await setSchedule(schedule, true);
  await page.goto('https://www.youtube.com/watch?v=test');

  await expect(page.getByText(/次に見られるのは .+10:00 から/)).toBeVisible();
});

test('見られる時間なら YouTube を開ける', async ({ page, setSchedule }) => {
  await setSchedule(ALLOW_ALL, false);
  await page.goto('https://www.youtube.com/watch?v=test');

  await expect(page).toHaveTitle('Fake YouTube');
});

test('見られる時間が終わると、開いている YouTube がブロック画面に切り替わる', async ({
  page,
  setSchedule,
}) => {
  await setSchedule(ALLOW_ALL, false);
  await page.goto('https://www.youtube.com/watch?v=test');
  await expect(page.locator('html')).toHaveAttribute('data-mast', 'loaded');

  await setSchedule(BLOCK_ALL, true);

  await expect(page).toHaveURL(BLOCKED_PAGE);
});

test('他サイトに埋め込まれた YouTube も、ブロック画面に置き換わる', async ({
  page,
  setSchedule,
}) => {
  await setSchedule(BLOCK_ALL, true);
  await page.goto('https://example.com/');

  await expect(page).toHaveURL('https://example.com/');
  const frame = page.frameLocator('iframe');
  await expect(
    frame.getByRole('heading', { name: '今はYouTubeを見られない時間です' }),
  ).toBeVisible();
  // 埋め込み先のサイトごと閉じてしまわないよう、「タブを閉じる」は出さない
  await expect(frame.getByRole('button', { name: 'タブを閉じる' })).toHaveCount(0);
});

test('YouTube Music はブロックしない', async ({ page, setSchedule }) => {
  await setSchedule(BLOCK_ALL, true);
  await page.goto('https://music.youtube.com/');

  await expect(page).toHaveTitle('Fake Music');
});

test('「タブを閉じる」でタブが閉じる', async ({ page, setSchedule }) => {
  await setSchedule(BLOCK_ALL, true);
  await page.goto('https://www.youtube.com/watch?v=test');

  await page.getByRole('button', { name: 'タブを閉じる' }).click();

  await expect.poll(() => page.isClosed()).toBe(true);
});

test('見られる時間になったら、ブロック画面から元のページを開ける', async ({
  page,
  setSchedule,
}) => {
  await setSchedule(BLOCK_ALL, true);
  await page.goto('https://www.youtube.com/watch?v=test');
  await expect(page).toHaveURL(BLOCKED_PAGE);

  await setSchedule(ALLOW_ALL, false);
  await page.reload();
  await expect(page.getByRole('heading', { name: '見られる時間になりました' })).toBeVisible();
  await page.getByRole('link', { name: '元のページを開く' }).click();

  await expect(page).toHaveURL('https://www.youtube.com/watch?v=test');
  await expect(page).toHaveTitle('Fake YouTube');
});
