import type { browser } from 'wxt/browser';
import { ALLOW_ALL, BLOCK_ALL, expect, logicalWeekday, test } from './fixtures';

// Service Worker の中で動かすコードから使う
declare const chrome: typeof browser;

const WEEKDAY_LABELS = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

test('保存されている予約枠を、月曜始まりで表示する', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  // 保存されていなければ初期値（平日20〜23時、土日9〜23時）
  await expect(page.getByRole('group')).toHaveText([
    /^月曜日/,
    /^火曜日/,
    /^水曜日/,
    /^木曜日/,
    /^金曜日/,
    /^土曜日/,
    /^日曜日/,
  ]);
  await expect(page.getByLabel('月曜日の種類')).toHaveValue('window');
  await expect(page.getByLabel('月曜日の開始').locator('option:checked')).toHaveText('20:00');
  await expect(page.getByLabel('土曜日の開始').locator('option:checked')).toHaveText('9:00');
  await expect(page.getByRole('button', { name: '保存する' })).toBeDisabled();
});

test('0時を過ぎた時刻は「翌」をつけて選ぶ', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await page.getByLabel('月曜日の終了').selectOption({ label: '翌2:00' });

  await expect(page.getByText('予約枠を広げる変更です')).toBeVisible();
});

test('予約枠を狭めて保存すると、すぐに反映される', async ({
  page,
  extensionId,
  setSchedule,
  waitForBlocking,
}) => {
  await setSchedule(ALLOW_ALL, false);
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await page.getByLabel(`${WEEKDAY_LABELS[logicalWeekday()]}の種類`).selectOption('見ない日');
  await expect(
    page.getByText('予約枠を狭める変更です。保存するとすぐに反映されます。'),
  ).toBeVisible();
  const savedAt = Date.now();
  await page.getByRole('button', { name: '保存する' }).click();

  await expect(page.getByRole('status')).toHaveText('保存しました');
  await waitForBlocking(true, savedAt);
  await expect(page.getByText('今は見られない時間です')).toBeVisible();
  await page.goto('https://www.youtube.com/watch?v=test');
  await expect(
    page.getByRole('heading', { name: '今はYouTubeを見られない時間です' }),
  ).toBeVisible();
});

test('予約枠を広げる変更は、そう表示してから保存する', async ({
  page,
  extensionId,
  setSchedule,
  waitForBlocking,
}) => {
  await setSchedule(BLOCK_ALL, true);
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  const label = WEEKDAY_LABELS[logicalWeekday()];
  await page.getByLabel(`${label}の種類`).selectOption('時間帯');
  await page.getByLabel(`${label}の開始`).selectOption({ label: '4:00' });
  await page.getByLabel(`${label}の終了`).selectOption({ label: '翌4:00' });
  await expect(page.getByText('予約枠を広げる変更です')).toBeVisible();
  const savedAt = Date.now();
  await page.getByRole('button', { name: '保存する' }).click();

  await waitForBlocking(false, savedAt);
  await expect(page.getByText(/^今は見られます/)).toBeVisible();
});

test('予算を設定できる', async ({ page, extensionId, serviceWorker }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await page.getByLabel('月曜日の種類').selectOption('時間帯＋予算');
  await page.getByLabel('月曜日の予算（分）').fill('45');
  await page.getByRole('button', { name: '保存する' }).click();
  await expect(page.getByRole('status')).toHaveText('保存しました');

  const { schedule } = await serviceWorker.evaluate(() => chrome.storage.sync.get('schedule'));
  expect((schedule as unknown[])[1]).toEqual({
    type: 'combined',
    window: { start: 20 * 60, end: 23 * 60 },
    budgetMinutes: 45,
  });
});

test('誤りがあれば表示し、保存できない', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await page.getByLabel('月曜日の開始').selectOption({ label: '23:00' });
  await page.getByLabel('月曜日の終了').selectOption({ label: '20:00' });

  await expect(page.getByRole('alert')).toHaveText(
    '月曜：時間帯の終わりは始まりより後にしてください',
  );
  await expect(page.getByRole('button', { name: '保存する' })).toBeDisabled();

  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('別の端末で変更された予約枠が、開いている設定画面に反映される', async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.getByLabel('月曜日の種類')).toHaveValue('window');

  // 同期で届いた変更の代わりに、storage.sync を直接書き換える
  await serviceWorker.evaluate((schedule) => chrome.storage.sync.set({ schedule }), BLOCK_ALL);

  await expect(page.getByLabel('月曜日の種類')).toHaveValue('none');
  await expect(page.getByRole('button', { name: '保存する' })).toBeDisabled();
});

test('編集中なら、別の端末で変更されても編集内容を残す', async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByLabel('火曜日の種類').selectOption('予算');

  await serviceWorker.evaluate((schedule) => chrome.storage.sync.set({ schedule }), BLOCK_ALL);

  // 保存されている側（見ない日）と比べ直すので、広げる変更になる
  await expect(page.getByText('予約枠を広げる変更です')).toBeVisible();
  await expect(page.getByLabel('火曜日の種類')).toHaveValue('budget');
  await expect(page.getByLabel('月曜日の種類')).toHaveValue('window');
});

test('今の状態と、今日の視聴時間を表示する', async ({
  page,
  extensionId,
  setSchedule,
  setTodayUsage,
}) => {
  await setTodayUsage(23 * 60 * 1000);
  await setSchedule(Array(7).fill({ type: 'budget', budgetMinutes: 60 }), false);
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await expect(page.getByText(/^今は見られます/)).toBeVisible();
  await expect(page.getByText('今日の視聴時間：23分（残り 37分）')).toBeVisible();
});
