import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getOrCreateDeviceId } from './device-id';

describe('getOrCreateDeviceId', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('初回はIDを生成して storage.local に保存する', async () => {
    const id = await getOrCreateDeviceId();

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await browser.storage.local.get('deviceId')).toEqual({ deviceId: id });
  });

  it('2回目以降は同じIDを返す', async () => {
    const first = await getOrCreateDeviceId();
    const second = await getOrCreateDeviceId();

    expect(second).toBe(first);
  });

  it('storage.sync には保存しない', async () => {
    await getOrCreateDeviceId();

    expect(await browser.storage.sync.get(null)).toEqual({});
  });
});
