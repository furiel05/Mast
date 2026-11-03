/**
 * TOTP（RFC 6238）。SHA-1、6桁、30秒（docs/spec.md「TOTPの仕様」）。
 * 秘密鍵を扱うコードなので、ライブラリを使わずに Web Crypto API で書く
 */

/** コードの桁数 */
export const TOTP_DIGITS = 6;

/** コードが切り替わる間隔（秒） */
export const TOTP_PERIOD_SECONDS = 30;

/** スマホと端末の時計のずれを見込んで、前後いくつ分のコードまで受け付けるか */
const ACCEPTED_DRIFT_STEPS = 1;

/** HOTP（RFC 4226）。counter 番目のコードを返す */
export async function hotp(
  key: Uint8Array<ArrayBuffer>,
  counter: number,
  digits = TOTP_DIGITS,
): Promise<string> {
  // counter を8バイトのビッグエンディアンにする。2^32 を超えても扱えるよう上位と下位に分ける
  const message = new DataView(new ArrayBuffer(8));
  message.setUint32(0, Math.floor(counter / 2 ** 32));
  message.setUint32(4, counter >>> 0);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, message));

  // 動的切り捨て（RFC 4226 5.3節）：最後のバイトの下位4ビットが示す位置から4バイト取り出す
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary = new DataView(hmac.buffer).getUint32(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** time の時点のTOTPコード */
export function totp(
  key: Uint8Array<ArrayBuffer>,
  time: Date,
  digits = TOTP_DIGITS,
): Promise<string> {
  return hotp(key, stepOf(time), digits);
}

/** 入力されたコードが、time の時点で有効か。前後1つ分（30秒）のずれまで受け付ける */
export async function verifyTotp(
  key: Uint8Array<ArrayBuffer>,
  code: string,
  time: Date,
): Promise<boolean> {
  const normalized = code.replace(/\s/g, '');
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(normalized)) {
    return false;
  }
  const step = stepOf(time);
  for (let drift = -ACCEPTED_DRIFT_STEPS; drift <= ACCEPTED_DRIFT_STEPS; drift++) {
    if ((await hotp(key, step + drift)) === normalized) {
      return true;
    }
  }
  return false;
}

function stepOf(time: Date): number {
  return Math.floor(time.getTime() / 1000 / TOTP_PERIOD_SECONDS);
}

/**
 * 認証アプリに登録するための otpauth:// のURI。QRコードにして表示する。
 * アルゴリズム・桁数・間隔は標準の値だが、読み違える認証アプリがないよう明示する
 */
export function otpauthUri(secretBase32: string): string {
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer: 'Mast',
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/Mast?${params}`;
}
