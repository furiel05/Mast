import { browser } from 'wxt/browser';

const KEY = 'deviceId';

/**
 * この端末のIDを返す。初回呼び出し時に生成して保存する。
 * 予算の消費状況を端末ごとのキーに分けるために使う。
 * 端末ごとに別の値が必要なので、sync ではなく local に保存する。
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const stored = await browser.storage.local.get(KEY);
  const existing = stored[KEY];
  if (typeof existing === 'string') {
    return existing;
  }
  const id = crypto.randomUUID();
  await browser.storage.local.set({ [KEY]: id });
  return id;
}
