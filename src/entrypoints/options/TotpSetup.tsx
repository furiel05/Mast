import { type FormEvent, useState } from 'react';
import { otpauthUri } from '../../core/totp';
import { generateTotpSecret, registerTotpSecret } from '../../storage/totp-store';
import { QrCode } from './QrCode';

const ERROR_MESSAGES = {
  'wrong-code': 'コードが違います。認証アプリに今表示されているコードを入力してください。',
  'already-registered':
    '別の端末で先に設定が済んでいました。その端末で登録した認証アプリのコードを使ってください。',
} as const;

/**
 * 承認コード（TOTP）の初回セットアップ（docs/spec.md「初回セットアップ」）。
 * 確認のコードが合うまで秘密鍵は保存しないので、途中でやめても何も残らない
 */
export function TotpSetup() {
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<keyof typeof ERROR_MESSAGES | null>(null);

  const register = async (e: FormEvent) => {
    e.preventDefault();
    if (secret === null) {
      return;
    }
    const result = await registerTotpSecret(secret, code, new Date());
    // 保存できたら、storage.onChanged で設定画面が読み直され、この画面は消える
    setError(result === 'registered' ? null : result);
  };

  return (
    <section className="card setup" aria-labelledby="setup-heading">
      <h2 id="setup-heading">承認コードの設定</h2>
      <p>
        設定すると、予約枠を広げる変更には、スマホの認証アプリ（Google Authenticator
        など）に表示される6桁のコードが必要になり、反映されるのは申請から24時間後になります。
      </p>
      <p className="warning">設定するまでは、どんな変更もすぐに反映されます。</p>

      {secret === null ? (
        <div className="actions">
          <button type="button" className="primary" onClick={() => setSecret(generateTotpSecret())}>
            設定を始める
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => void register(e)}>
          <ol>
            <li>
              認証アプリで、このQRコードを読み取ってください。
              <QrCode text={otpauthUri(secret)} label="認証アプリに登録するQRコード" />
              読み取れないときは、この文字列を手入力してください。
              <code className="secret">{secret.match(/.{1,4}/g)?.join(' ')}</code>
            </li>
            <li>
              確認のため、認証アプリに表示された6桁のコードを入力してください。
              <div className="actions">
                <input
                  className="code"
                  aria-label="確認コード"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <button type="submit" className="primary">
                  設定を完了する
                </button>
              </div>
            </li>
          </ol>
          {error !== null && <p role="alert">{ERROR_MESSAGES[error]}</p>}
          <p className="hint">
            設定が済むと、QRコードと秘密鍵は二度と表示されません。別のパソコンのChromeでも同じ認証アプリを使うには、Chromeの同期で「拡張機能」をオンにしてください。
          </p>
        </form>
      )}
    </section>
  );
}
