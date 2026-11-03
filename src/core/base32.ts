/**
 * Base32（RFC 4648）。TOTPの秘密鍵を、認証アプリに手入力できる文字列にするために使う。
 * 秘密鍵を扱うコードなので、ライブラリを使わずに書く（docs/spec.md「TOTPの仕様」）
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * バイト列を Base32 にする。末尾の「=」は付けない。
 * otpauth:// の secret は「=」なしで書くのが慣例で、認証アプリもそれを前提にしているため
 */
export function encodeBase32(bytes: Uint8Array): string {
  let result = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    // 使い終わった上位のビットは捨て、まだ文字にしていないビット（12ビット以下）だけを持つ
    buffer = ((buffer << 8) | byte) & 0xfff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += ALPHABET[(buffer >> bits) & 31];
    }
  }
  if (bits > 0) {
    result += ALPHABET[(buffer << (5 - bits)) & 31];
  }
  return result;
}

/**
 * Base32 をバイト列に戻す。小文字、空白、末尾の「=」は受け付ける（手で写した文字列を読むため）。
 * Base32 として読めなければ null
 */
export function decodeBase32(text: string): Uint8Array<ArrayBuffer> | null {
  const normalized = text.replace(/\s/g, '').replace(/=+$/, '').toUpperCase();
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of normalized) {
    const value = ALPHABET.indexOf(char);
    if (value === -1) {
      return null;
    }
    buffer = ((buffer << 5) | value) & 0xfff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}
