import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { decodeBase32 } from '../core/base32';
import { totp } from '../core/totp';
import {
  generateTotpSecret,
  isTotpRegistered,
  registerTotpSecret,
  verifyTotpCode,
} from './totp-store';

const NOW = new Date(2026, 10, 2, 12, 0);

const codeFor = (secret: string, time = NOW) =>
  totp(decodeBase32(secret) ?? new Uint8Array(), time);

/** 正しいコードと違う6桁のコード */
const wrongCodeFor = async (secret: string) =>
  String((Number(await codeFor(secret)) + 1) % 1_000_000).padStart(6, '0');

describe('generateTotpSecret', () => {
  it('20バイトの秘密鍵を、Base32 の32文字で返す', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(decodeBase32(secret)).toHaveLength(20);
  });

  it('毎回違う秘密鍵を作る', () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret());
  });
});

describe('registerTotpSecret', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('確認のコードが合えば保存する', async () => {
    const secret = generateTotpSecret();
    expect(await registerTotpSecret(secret, await codeFor(secret), NOW)).toBe('registered');
    expect(await browser.storage.sync.get('totpSecret')).toEqual({ totpSecret: secret });
    expect(await isTotpRegistered()).toBe(true);
  });

  it('確認のコードが違えば保存しない', async () => {
    const secret = generateTotpSecret();
    expect(await registerTotpSecret(secret, await wrongCodeFor(secret), NOW)).toBe('wrong-code');
    expect(await isTotpRegistered()).toBe(false);
  });

  it('別の端末で先にセットアップが済んでいたら、上書きしない', async () => {
    const first = generateTotpSecret();
    await browser.storage.sync.set({ totpSecret: first });
    const second = generateTotpSecret();
    expect(await registerTotpSecret(second, await codeFor(second), NOW)).toBe('already-registered');
    expect(await browser.storage.sync.get('totpSecret')).toEqual({ totpSecret: first });
  });
});

describe('verifyTotpCode', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('保存された秘密鍵のコードなら true', async () => {
    const secret = generateTotpSecret();
    await browser.storage.sync.set({ totpSecret: secret });
    expect(await verifyTotpCode(await codeFor(secret), NOW)).toBe(true);
    expect(await verifyTotpCode(await wrongCodeFor(secret), NOW)).toBe(false);
  });

  it('セットアップ前なら false', async () => {
    expect(await verifyTotpCode('123456', NOW)).toBe(false);
  });

  it('保存された値が壊れていたら、セットアップ済みのまま、どのコードも受け付けない', async () => {
    await browser.storage.sync.set({ totpSecret: '!!!' });
    expect(await isTotpRegistered()).toBe(true);
    expect(await verifyTotpCode('123456', NOW)).toBe(false);
  });
});
