import type { Locator, Page } from '@playwright/test';

/** 設定画面で、1つの曜日の予約枠を操作するための部品 */

/** 曜日の行 */
export function dayRow(page: Page, label: string): Locator {
  return page.getByRole('group', { name: label, exact: true });
}

/** 曜日の行の「1日に見てよい時間（上限）」のボタン */
export function limitOf(page: Page, label: string): Locator {
  return dayRow(page, label).getByRole('group', { name: '1日に見てよい時間（上限）' });
}

/** 時間帯のボタン。「月曜日の時間帯（20:00 〜 23:00）」のように、今の時間帯を名前に含む */
export function rangeButton(page: Page, label: string): Locator {
  return page.getByRole('button', { name: new RegExp(`^${label}の時間帯`) });
}

/** 時間帯を選ぶポップアップ。開いていなければ開く */
export async function openRange(page: Page, label: string): Promise<Locator> {
  const dialog = page.getByRole('dialog', { name: `${label}の時間帯` });
  if (!(await dialog.isVisible())) {
    await rangeButton(page, label).click();
  }
  return dialog;
}

/** 時間帯を「いつでも」にして、ポップアップを閉じる */
export async function setAllDay(page: Page, label: string): Promise<void> {
  const dialog = await openRange(page, label);
  await dialog.getByText('いつでも（時間帯を決めない）').click();
  await dialog.getByRole('button', { name: '閉じる' }).click();
}

/**
 * ホイールで時刻を選ぶ。キーボードで操作する（先頭に戻してから、目的の値まで下へ送る）。
 * クリックだと、Playwright が項目を見える位置までスクロールしたときに別の値が選ばれることがあるため
 *
 * @param hour 時のホイールの表示（「23」「翌1」）
 * @param minute 分のホイールの表示（「00」「15」）
 */
export async function pickTime(
  page: Page,
  label: string,
  edge: '開始' | '終了',
  hour: string,
  minute: string,
): Promise<void> {
  const dialog = await openRange(page, label);
  for (const [unit, text] of [
    ['時', hour],
    ['分', minute],
  ] as const) {
    const wheel = dialog.getByRole('listbox', { name: `${label}の${edge}（${unit}）` });
    const index = (await wheel.getByRole('option').allTextContents()).indexOf(text);
    if (index === -1) {
      throw new Error(`${label}の${edge}（${unit}）に「${text}」がない`);
    }
    await wheel.focus();
    await wheel.press('Home');
    for (let i = 0; i < index; i++) {
      await wheel.press('ArrowDown');
    }
  }
}
