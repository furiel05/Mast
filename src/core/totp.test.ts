import { describe, expect, it } from 'vitest';
import { hotp, otpauthUri, totp, verifyTotp } from './totp';

// RFC 4226・RFC 6238 のテストで使う秘密鍵（SHA-1 用）
const KEY = new TextEncoder().encode('12345678901234567890');

describe('hotp', () => {
  // RFC 4226 付録D
  const expected = [
    '755224',
    '287082',
    '359152',
    '969429',
    '338314',
    '254676',
    '287922',
    '162583',
    '399871',
    '520489',
  ];

  it.each(expected.map((code, counter) => [counter, code]))(
    'カウンタ %i は %s',
    async (counter, code) => {
      expect(await hotp(KEY, counter as number)).toBe(code);
    },
  );
});

describe('totp', () => {
  // RFC 6238 付録B（SHA-1）。RFC のベクトルは8桁なので、8桁で比べる
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('%i 秒は %s', async (seconds, code) => {
    expect(await totp(KEY, new Date(seconds * 1000), 8)).toBe(code);
  });

  it('6桁では8桁のコードの下6桁になる', async () => {
    expect(await totp(KEY, new Date(59 * 1000))).toBe('287082');
  });
});

describe('verifyTotp', () => {
  // 1111111111 秒は、1111111110〜1111111140 秒の区間のコードになる
  const now = new Date(1111111111 * 1000);
  const codeAt = (offsetSeconds: number) =>
    totp(KEY, new Date(now.getTime() + offsetSeconds * 1000));

  it('今のコードを受け付ける', async () => {
    expect(await verifyTotp(KEY, await codeAt(0), now)).toBe(true);
  });

  it('前後1つ分（30秒）のコードも受け付ける', async () => {
    expect(await verifyTotp(KEY, await codeAt(-30), now)).toBe(true);
    expect(await verifyTotp(KEY, await codeAt(30), now)).toBe(true);
  });

  it('前後2つ分ずれたコードは受け付けない', async () => {
    expect(await verifyTotp(KEY, await codeAt(-60), now)).toBe(false);
    expect(await verifyTotp(KEY, await codeAt(60), now)).toBe(false);
  });

  it('空白が混ざっていても受け付ける', async () => {
    const code = await codeAt(0);
    expect(await verifyTotp(KEY, ` ${code.slice(0, 3)} ${code.slice(3)} `, now)).toBe(true);
  });

  it('6桁の数字でなければ受け付けない', async () => {
    const code = await codeAt(0);
    expect(await verifyTotp(KEY, code.slice(1), now)).toBe(false);
    expect(await verifyTotp(KEY, `${code}0`, now)).toBe(false);
    expect(await verifyTotp(KEY, '', now)).toBe(false);
  });

  it('違う鍵のコードは受け付けない', async () => {
    const other = new TextEncoder().encode('09876543210987654321');
    expect(await verifyTotp(other, await codeAt(0), now)).toBe(false);
  });
});

describe('otpauthUri', () => {
  it('認証アプリに登録する形式', () => {
    expect(otpauthUri('GEZDGNBVGY3TQOJQ')).toBe(
      'otpauth://totp/Mast?secret=GEZDGNBVGY3TQOJQ&issuer=Mast&algorithm=SHA1&digits=6&period=30',
    );
  });
});
