import type { Page } from '@playwright/test';
import type { browser } from 'wxt/browser';
import { ALLOW_ALL, BLOCK_ALL, expect, logicalWeekday, test } from './fixtures';

// Service Worker の中で動かすコードから使う
declare const chrome: typeof browser;

const WEEKDAY_LABELS = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

/** 時刻をクリックして直接入力する */
async function typeTime(page: Page, label: string, text: string): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`^${label}を入力`) }).click();
  await page.getByLabel(`${label}時刻`).fill(text);
  await page.getByLabel(`${label}時刻`).press('Enter');
}

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
  await expect(page.getByRole('slider', { name: '月曜日の開始' })).toHaveAttribute(
    'aria-valuetext',
    '20:00',
  );
  await expect(page.getByRole('slider', { name: '土曜日の開始' })).toHaveAttribute(
    'aria-valuetext',
    '9:00',
  );
  await expect(
    page.getByRole('group', { name: '月曜日の1日の上限' }).getByLabel('なし'),
  ).toBeChecked();
  await expect(page.getByRole('button', { name: '保存する' })).toBeDisabled();
});

test('時間帯の端は、矢印キーで15分ずつ動かせる', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  const end = page.getByRole('slider', { name: '月曜日の終了' });
  await end.focus();
  await end.press('PageUp');
  await end.press('PageUp');
  await end.press('PageUp');
  await end.press('ArrowRight');

  await expect(end).toHaveAttribute('aria-valuetext', '翌2:15');
  await expect(page.getByRole('button', { name: /^月曜日の終了を入力/ })).toHaveText('翌2:15');
  await expect(page.getByText('予約枠を広げる変更です')).toBeVisible();
});

test('時間帯の端は、ドラッグで15分刻みに動かせる', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  // 帯の幅は24時間なので、左端から 10/24 の位置は14:00
  const start = page.getByRole('slider', { name: '月曜日の開始' });
  const track = page.locator('.track').first();
  const box = await track.boundingBox();
  if (box === null) {
    throw new Error('帯が表示されていない');
  }
  await start.hover();
  await page.mouse.down();
  await page.mouse.move(box.x + (box.width * 10) / 24 + 1, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  await expect(start).toHaveAttribute('aria-valuetext', '14:00');
});

test('時刻を直接入力できる。4時より前は翌日として扱う', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await typeTime(page, '月曜日の開始', '21:10');
  await typeTime(page, '月曜日の終了', '1:30');

  await expect(page.getByRole('slider', { name: '月曜日の開始' })).toHaveAttribute(
    'aria-valuetext',
    '21:10',
  );
  await expect(page.getByRole('slider', { name: '月曜日の終了' })).toHaveAttribute(
    'aria-valuetext',
    '翌1:30',
  );

  // 読めない時刻は受け付けない
  await page.getByRole('button', { name: /^月曜日の開始を入力/ }).click();
  await page.getByLabel('月曜日の開始時刻').fill('あとで');
  await page.getByLabel('月曜日の開始時刻').press('Enter');
  await expect(page.getByText('20:00 や 翌1:30 のように入力してください')).toBeVisible();
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

  const label = WEEKDAY_LABELS[logicalWeekday()];
  await page.getByRole('switch', { name: `${label}に見る` }).click();
  await page
    .getByRole('group', { name: label })
    .getByRole('button', { name: 'いつでもにする' })
    .click();
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
  await page.getByRole('group', { name: '月曜日の1日の上限' }).getByText('1時間').click();
  // いつでも＋上限 → 予算ルール。その他は分で入力する
  await page
    .getByRole('group', { name: '火曜日' })
    .getByRole('button', { name: 'いつでもにする' })
    .click();
  await page.getByRole('group', { name: '火曜日の1日の上限' }).getByText('その他').click();
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
  const limit = page.getByRole('group', { name: '月曜日の1日の上限' });
  await limit.getByText('2時間').click();
  await expect(page.getByText('時間帯より長いので、上限なしと同じです')).toHaveCount(0);
  await limit.getByText('その他').click();
  await page.getByLabel('月曜日の1日の上限（分）').fill('180');
  await expect(page.getByText('時間帯より長いので、上限なしと同じです')).toBeVisible();
});

test('見るをオフにしてからオンに戻すと、元の時間帯と上限に戻る', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('group', { name: '月曜日の1日の上限' }).getByText('30分').click();

  const toggle = page.getByRole('switch', { name: '月曜日に見る' });
  await toggle.click();
  await expect(page.getByRole('group', { name: '月曜日' })).toContainText('見ない日');
  await toggle.click();

  await expect(page.getByRole('slider', { name: '月曜日の開始' })).toHaveAttribute(
    'aria-valuetext',
    '20:00',
  );
  await expect(
    page.getByRole('group', { name: '月曜日の1日の上限' }).getByLabel('30分'),
  ).toBeChecked();
});

test('誤りがあれば表示し、保存できない', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await typeTime(page, '月曜日の開始', '23:00');
  await typeTime(page, '月曜日の終了', '20:00');

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
  await page.getByRole('group', { name: '火曜日の1日の上限' }).getByText('30分').click();

  await serviceWorker.evaluate((schedule) => chrome.storage.sync.set({ schedule }), BLOCK_ALL);

  // 保存されている側（見ない日）と比べ直すので、広げる変更になる
  await expect(page.getByText('予約枠を広げる変更です')).toBeVisible();
  await expect(
    page.getByRole('group', { name: '火曜日の1日の上限' }).getByLabel('30分'),
  ).toBeChecked();
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
