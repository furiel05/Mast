import type { browser } from 'wxt/browser';
import {
  ALLOW_ALL,
  BLOCK_ALL,
  expect,
  logicalWeekday,
  TOTP_SECRET,
  test,
  totpCode,
} from './fixtures';

// Service Worker の中で動かすコードから使う
declare const chrome: typeof browser;

const WEEKDAY_LABELS = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
const HOUR = 60 * 60 * 1000;

test('承認コードを設定する', async ({ page, extensionId, serviceWorker }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.getByText('設定するまでは、どんな変更もすぐに反映されます。')).toBeVisible();

  await page.getByRole('button', { name: '設定を始める' }).click();
  await expect(page.getByRole('img', { name: '認証アプリに登録するQRコード' })).toBeVisible();
  const secret = (await page.locator('.secret').textContent()) ?? '';
  expect(secret).toMatch(/^([A-Z2-7]{4} ){7}[A-Z2-7]{4}$/);

  // 違うコードでは設定されない
  const code = totpCode(secret);
  await page
    .getByLabel('確認コード')
    .fill(String((Number(code) + 500_000) % 1_000_000).padStart(6, '0'));
  await page.getByRole('button', { name: '設定を完了する' }).click();
  await expect(page.getByRole('alert')).toHaveText(/コードが違います/);

  await page.getByLabel('確認コード').fill(totpCode(secret));
  await page.getByRole('button', { name: '設定を完了する' }).click();

  await expect(page.getByText('承認コードは設定済みです。')).toBeVisible();
  await expect(page.getByRole('heading', { name: '承認コードの設定' })).toHaveCount(0);
  const { totpSecret } = await serviceWorker.evaluate(() => chrome.storage.sync.get('totpSecret'));
  expect(totpSecret).toBe(secret.replace(/ /g, ''));
});

test('設定後は、広げる変更を認証アプリのコードで申請し、すぐには反映しない', async ({
  page,
  extensionId,
  setSchedule,
  waitForBlocking,
  registerTotp,
}) => {
  await registerTotp();
  await setSchedule(BLOCK_ALL, true);
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  const label = WEEKDAY_LABELS[logicalWeekday()];
  await page.getByLabel(`${label}の種類`).selectOption('時間帯');
  await page.getByLabel(`${label}の開始`).selectOption({ label: '4:00' });
  await page.getByLabel(`${label}の終了`).selectOption({ label: '翌4:00' });
  await expect(page.getByText('申請すると、24時間後に反映されます')).toBeVisible();

  await page.getByLabel('認証アプリのコード').fill('000000');
  await page.getByRole('button', { name: '申請する' }).click();
  await expect(page.getByRole('status')).toHaveText(/^コードが違います/);

  await page.getByLabel('認証アプリのコード').fill(totpCode(TOTP_SECRET));
  const requestedAt = Date.now();
  await page.getByRole('button', { name: '申請する' }).click();

  await expect(page.getByRole('status')).toHaveText(
    /^申請しました。明日（.）\d+:\d\d に反映されます$/,
  );
  const pending = page.getByRole('region', { name: '予約中の変更' });
  await expect(pending.getByRole('listitem')).toHaveText([`${label}：見ない日 → 4:00〜翌4:00`]);
  // 編集欄は今有効な予約枠に戻る
  await expect(page.getByLabel(`${label}の種類`)).toHaveValue('none');
  await waitForBlocking(true, requestedAt);
});

test('予約中の変更は、反映される時刻になるとブロックを解除する', async ({
  serviceWorker,
  setSchedule,
  waitForBlocking,
}) => {
  await setSchedule(BLOCK_ALL, true);

  const effectiveAt = await serviceWorker.evaluate(async (schedule) => {
    const effectiveAt = Date.now() + 3000;
    await chrome.storage.sync.set({
      pendingChange: { schedule, requestedAt: effectiveAt - 24 * 60 * 60 * 1000, effectiveAt },
    });
    return effectiveAt;
  }, ALLOW_ALL);
  // 保存した直後の判定ではまだブロックしている
  await waitForBlocking(true, effectiveAt - 3000);

  await expect
    .poll(
      () =>
        serviceWorker.evaluate(async () => {
          const rules = await chrome.declarativeNetRequest.getDynamicRules();
          return rules.length > 0;
        }),
      { timeout: 15_000 },
    )
    .toBe(false);
  expect(Date.now()).toBeGreaterThanOrEqual(effectiveAt);
});

test('予約中の変更は、認証なしで取り消せる', async ({
  page,
  extensionId,
  serviceWorker,
  setSchedule,
  registerTotp,
}) => {
  await registerTotp();
  await setSchedule(BLOCK_ALL, true);
  await serviceWorker.evaluate(
    async ({ schedule, hour }) => {
      const now = Date.now();
      await chrome.storage.sync.set({
        pendingChange: { schedule, requestedAt: now, effectiveAt: now + 24 * hour },
      });
    },
    { schedule: ALLOW_ALL, hour: HOUR },
  );
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  const pending = page.getByRole('region', { name: '予約中の変更' });
  await expect(pending.getByRole('listitem')).toHaveCount(7);
  await pending.getByRole('button', { name: '取り消す' }).click();

  await expect(pending).toHaveCount(0);
  const stored = await serviceWorker.evaluate(() => chrome.storage.sync.get('pendingChange'));
  expect(stored).toEqual({});
});

test('予約中に狭める変更を保存すると、予約中の変更は取り消される', async ({
  page,
  extensionId,
  serviceWorker,
  setSchedule,
  registerTotp,
}) => {
  await registerTotp();
  await setSchedule(ALLOW_ALL, false);
  await serviceWorker.evaluate(
    async ({ schedule, hour }) => {
      const now = Date.now();
      await chrome.storage.sync.set({
        pendingChange: { schedule, requestedAt: now, effectiveAt: now + 24 * hour },
      });
    },
    { schedule: Array(7).fill({ type: 'budget', budgetMinutes: 1440 }), hour: HOUR },
  );
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.getByRole('region', { name: '予約中の変更' })).toBeVisible();

  await page.getByLabel('火曜日の種類').selectOption('見ない日');
  await expect(page.getByText('保存すると、予約中の変更は取り消されます。')).toBeVisible();
  await page.getByRole('button', { name: '保存する' }).click();

  await expect(page.getByRole('status')).toHaveText('保存しました');
  await expect(page.getByRole('region', { name: '予約中の変更' })).toHaveCount(0);
});
