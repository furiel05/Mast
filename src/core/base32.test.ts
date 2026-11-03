import { describe, expect, it } from 'vitest';
import { decodeBase32, encodeBase32 } from './base32';

const bytesOf = (text: string) => new TextEncoder().encode(text);

// RFC 4648 10節のテストベクトル。末尾の「=」は付けない形で比べる
const VECTORS: [string, string][] = [
  ['', ''],
  ['f', 'MY'],
  ['fo', 'MZXQ'],
  ['foo', 'MZXW6'],
  ['foob', 'MZXW6YQ'],
  ['fooba', 'MZXW6YTB'],
  ['foobar', 'MZXW6YTBOI'],
];

describe('encodeBase32', () => {
  it.each(VECTORS)('RFC 4648 のテストベクトル "%s"', (text, encoded) => {
    expect(encodeBase32(bytesOf(text))).toBe(encoded);
  });

  it('RFC 6238 の秘密鍵', () => {
    expect(encodeBase32(bytesOf('12345678901234567890'))).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });
});

describe('decodeBase32', () => {
  it.each(VECTORS)('RFC 4648 のテストベクトル "%s"', (text, encoded) => {
    expect(decodeBase32(encoded)).toEqual(bytesOf(text));
  });

  it('「=」で埋めた形も読める', () => {
    expect(decodeBase32('MZXW6YTBOI======')).toEqual(bytesOf('foobar'));
  });

  it('小文字や空白が混ざっていても読める', () => {
    expect(decodeBase32('gezd gnbv gy3t qojq')).toEqual(bytesOf('1234567890'));
  });

  it('Base32 にない文字があれば null', () => {
    expect(decodeBase32('MZXW1')).toBeNull();
    expect(decodeBase32('MZ=XW')).toBeNull();
  });

  it('任意のバイト列を元に戻せる', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => (i * 37) % 256);
    for (let length = 0; length <= 40; length++) {
      const slice = bytes.slice(0, length);
      expect(decodeBase32(encodeBase32(slice))).toEqual(slice);
    }
  });
});
