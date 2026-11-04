import type { browser } from 'wxt/browser';
import { ALLOW_ALL, BLOCK_ALL, expect, logicalWeekday, test } from './fixtures';
import { dayRow, limitOf, openRange, pickTime, rangeButton, setAllDay } from './schedule-editor';

// Service Worker の中で動かすコードから使う
declare const chrome: typeof browser;

const WEEKDAY_LABELS = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

test('保存されている予約枠を、月曜始まりで表示する', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  // 保存されていなければ初期値（平日20〜23時、土日9〜23時）
  await expect(page.getByRole('group', { name: /曜日$/ })).toHaveText([
    /^月曜日/,
    /^火曜日/,
    /^水曜日/,
    /^木曜日/,
    /^金曜日/,
    /^土曜日/,
    /^日曜日/,
  ]);
  await expect(page.getByRole('switch', { name: '月曜日に見る' })).toBeChecked();
  await expect(rangeButton(page, '月曜日')).toHaveText(/^20:00 〜 23:00/);
  await expect(rangeButton(page, '土曜日')).toHaveText(/^9:00 〜 23:00/);
  await expect(limitOf(page, '月曜日').getByLabel('上限なし')).toBeChecked();
  await expect(dayRow(page, '月曜日')).toContainText('20:00〜23:00 の間なら、いつでも見られます');
  await expect(page.getByRole('button', { name: '保存する' })).toBeDisabled();
});

test('ホイールの項目のクリックやスクロールで時刻を選ぶ', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const dialog = await openRange(page, '月曜日');

  // 真ん中（20）のすぐ下に見えている 21 を押す
  await dialog
    .getByRole('listbox', { name: '月曜日の開始（時）' })
    .getByRole('option', { name: '21', exact: true })
    .click();
  await expect(rangeButton(page, '月曜日')).toHaveText(/^21:00 〜 23:00/);

  // 終了の時を3行ぶん下へスクロールすると、23 から 翌2 になる
  await dialog.getByRole('listbox', { name: '月曜日の終了（時）' }).hover();
  await page.mouse.wheel(0, 32 * 3);
  await expect(rangeButton(page, '月曜日')).toHaveText(/^21:00 〜 翌2:00/);
  await expect(page.getByText('予約枠を広げる変更です')).toBeVisible();
});

test('ホイールはキーボードの上下キーでも動かせる', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const dialog = await openRange(page, '月曜日');

  await dialog.getByRole('listbox', { name: '月曜日の終了（分）' }).press('ArrowDown');
  await expect(rangeButton(page, '月曜日')).toHaveText(/^20:00 〜 23:15/);

  // 翌4時台は翌4:00にそろう
  await dialog.getByRole('listbox', { name: '月曜日の終了（時）' }).press('End');
  await expect(rangeButton(page, '月曜日')).toHaveText(/^20:00 〜 翌4:00/);

  // Esc で閉じる
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('「いつでも」にしてから戻すと、元の時間帯に戻る', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await setAllDay(page, '月曜日');
  await expect(rangeButton(page, '月曜日')).toHaveText(/^いつでも/);
  await expect(dayRow(page, '月曜日')).toContainText('1日中いつでも見られます');

  const dialog = await openRange(page, '月曜日');
  await dialog.getByText('いつでも（時間帯を決めない）').click();
  await expect(rangeButton(page, '月曜日')).toHaveText(/^20:00 〜 23:00/);
});

test('予約枠を狭めて保存すると、すぐに反映される', async ({
  page,
  extensionId,
  setSchedule,
  waitForBlocking,
}) => {
  await setSchedule(ALLOW_ALL, false);
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await page.getByRole('switch', { name: `${WEEKDAY_LABELS[logicalWeekday()]}に見る` }).click();
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

  const label = WEEKDAY_LABELS[logicalWeekday()] ?? '';
  await page.getByRole('switch', { name: `${label}に見る` }).click();
  await setAllDay(page, label);
  await expect(page.getByText('予約枠を広げる変更です')).toBeVisible();
  const savedAt = Date.now();
  await page.getByRole('button', { name: '保存する' }).click();

  await waitForBlocking(false, savedAt);
  await expect(page.getByText(/^今は見られます/)).toBeVisible();
});

test('1日の上限をボタンか、その他の入力で設定できる', async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  // 時間帯＋上限 → 組み合わせルール
  await limitOf(page, '月曜日').getByText('1時間').click();
  await expect(dayRow(page, '月曜日')).toContainText(
    '20:00〜23:00 のうち、合計1時間まで見られます',
  );
  // いつでも＋上限 → 予算ルール。その他は分で入力する
  await setAllDay(page, '火曜日');
  await limitOf(page, '火曜日').getByText('その他').click();
  await page.getByLabel('火曜日の1日の上限（分）').fill('45');
  await page.getByRole('button', { name: '保存する' }).click();
  await expect(page.getByRole('status')).toHaveText('保存しました');

  const { schedule } = await serviceWorker.evaluate(() => chrome.storage.sync.get('schedule'));
  expect((schedule as unknown[]).slice(1, 3)).toEqual([
    { type: 'combined', window: { start: 20 * 60, end: 23 * 60 }, budgetMinutes: 60 },
    { type: 'budget', budgetMinutes: 45 },
  ]);
});

test('時間帯より長い上限は、上限なしと同じだと表示する', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  // 20:00〜23:00 は3時間
  const limit = limitOf(page, '月曜日');
  await limit.getByText('2時間').click();
  await expect(page.getByText('上限なしと同じです')).toHaveCount(0);
  await limit.getByText('その他').click();
  await page.getByLabel('月曜日の1日の上限（分）').fill('180');
  await expect(dayRow(page, '月曜日')).toContainText(
    '20:00〜23:00 の間なら、いつでも見られます（上限は時間帯より長いので、上限なしと同じです）',
  );
});

test('見るをオフにしてからオンに戻すと、元の時間帯と上限に戻る', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await limitOf(page, '月曜日').getByText('30分').click();

  const toggle = page.getByRole('switch', { name: '月曜日に見る' });
  await toggle.click();
  await expect(dayRow(page, '月曜日')).toContainText('1日中見られません');
  await toggle.click();

  await expect(rangeButton(page, '月曜日')).toHaveText(/^20:00 〜 23:00/);
  await expect(limitOf(page, '月曜日').getByLabel('30分')).toBeChecked();
});

test('誤りがあれば表示し、保存できない', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await pickTime(page, '月曜日', '開始', '23', '00');
  await pickTime(page, '月曜日', '終了', '20', '00');
  await expect(page.getByRole('dialog')).toContainText('終わりは始まりより後にしてください');

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
  await expect(page.getByRole('switch', { name: '月曜日に見る' })).toBeChecked();

  // 同期で届いた変更の代わりに、storage.sync を直接書き換える
  await serviceWorker.evaluate((schedule) => chrome.storage.sync.set({ schedule }), BLOCK_ALL);

  await expect(page.getByRole('switch', { name: '月曜日に見る' })).not.toBeChecked();
  await expect(page.getByRole('button', { name: '保存する' })).toBeDisabled();
});

test('編集中なら、別の端末で変更されても編集内容を残す', async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await limitOf(page, '火曜日').getByText('30分').click();

  await serviceWorker.evaluate((schedule) => chrome.storage.sync.set({ schedule }), BLOCK_ALL);

  // 保存されている側（見ない日）と比べ直すので、広げる変更になる
  await expect(page.getByText('予約枠を広げる変更です')).toBeVisible();
  await expect(limitOf(page, '火曜日').getByLabel('30分')).toBeChecked();
  await expect(page.getByRole('switch', { name: '月曜日に見る' })).toBeChecked();
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
