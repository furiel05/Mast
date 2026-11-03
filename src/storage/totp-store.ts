import { browser } from 'wxt/browser';
import { decodeBase32, encodeBase32 } from '../core/base32';
import { verifyTotp } from '../core/totp';

/**
 * TOTPの秘密鍵（Base32）を保存する storage.sync のキー。
 * 同期して、WindowsとMacで同じ認証アプリの登録を使う（docs/spec.md「秘密鍵の扱い」）
 */
export const TOTP_SECRET_KEY = 'totpSecret';

/** 秘密鍵の長さ。RFC 4226 が勧める160ビット（SHA-1 の出力と同じ長さ） */
const SECRET_BYTES = 20;

/** 新しい秘密鍵を作る。保存はしない（確認のコードが合ってから registerTotpSecret で保存する） */
export function generateTotpSecret(): string {
  return encodeBase32(crypto.getRandomValues(new Uint8Array(SECRET_BYTES)));
}

/**
 * 初回セットアップが済んでいるか。
 * 保存された値が壊れていても済んでいるとみなす。壊れたら広げる変更ができなくなるが、
 * 壊れたことで承認なしに広げられるようになるよりはよい
 */
export async function isTotpRegistered(): Promise<boolean> {
  const stored = await browser.storage.sync.get(TOTP_SECRET_KEY);
  return stored[TOTP_SECRET_KEY] !== undefined;
}

export type RegisterResult = 'registered' | 'wrong-code' | 'already-registered';

/**
 * 認証アプリに登録した秘密鍵を、確認のコードが合ったら保存する。
 * 別の端末で先にセットアップが済んでいたら、上書きせずに already-registered を返す
 */
export async function registerTotpSecret(
  secret: string,
  code: string,
  now: Date,
): Promise<RegisterResult> {
  const key = decodeBase32(secret);
  if (key === null || !(await verifyTotp(key, code, now))) {
    return 'wrong-code';
  }
  if (await isTotpRegistered()) {
    return 'already-registered';
  }
  await browser.storage.sync.set({ [TOTP_SECRET_KEY]: secret });
  return 'registered';
}

/** 認証アプリのコードが合っているか。セットアップが済んでいなければ false */
export async function verifyTotpCode(code: string, now: Date): Promise<boolean> {
  const stored = await browser.storage.sync.get(TOTP_SECRET_KEY);
  const secret = stored[TOTP_SECRET_KEY];
  const key = typeof secret === 'string' ? decodeBase32(secret) : null;
  return key !== null && (await verifyTotp(key, code, now));
}
