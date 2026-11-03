/** Service Worker からコンテンツスクリプトへ送る「ページを読み込み直して」の合図 */
export const RELOAD_MESSAGE = { type: 'mast:reload' } as const;

export function isReloadMessage(message: unknown): boolean {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === RELOAD_MESSAGE.type
  );
}
