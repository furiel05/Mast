import { ALLOW_ALL, expect, test } from './fixtures';

test('Service Worker が起動する', async ({ extensionId }) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
});

test('設定画面が開ける', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await expect(page.getByRole('heading', { name: 'Mast 設定' })).toBeVisible();
});

test('YouTube のページでコンテンツスクリプトが動く', async ({ page, setSchedule }) => {
  await setSchedule(ALLOW_ALL, false);
  await page.goto('https://www.youtube.com/watch?v=test');

  await expect(page.locator('html')).toHaveAttribute('data-mast', 'loaded');
});

test('他サイトに埋め込まれた YouTube でもコンテンツスクリプトが動く', async ({
  page,
  setSchedule,
}) => {
  await setSchedule(ALLOW_ALL, false);
  await page.goto('https://example.com/');

  await expect(page.locator('html')).not.toHaveAttribute('data-mast', 'loaded');
  await expect(page.frameLocator('iframe').locator('html')).toHaveAttribute('data-mast', 'loaded');
});
