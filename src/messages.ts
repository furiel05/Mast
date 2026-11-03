/** Service Worker からコンテンツスクリプトへ送る「ページを読み込み直して」の合図 */
export const RELOAD_MESSAGE = { type: 'mast:reload' } as const;

/** Service Worker からコンテンツスクリプトへの「今再生中？」の問い合わせ。true か false で答える */
export const QUERY_PLAYBACK_MESSAGE = { type: 'mast:query-playback' } as const;

/** コンテンツスクリプトから Service Worker へ送る「再生が始まった・止まった」の知らせ */
export type PlaybackMessage = { type: 'mast:playback'; playing: boolean };

export function playbackMessage(playing: boolean): PlaybackMessage {
  return { type: 'mast:playback', playing };
}

export function isReloadMessage(message: unknown): boolean {
  return typeOf(message) === RELOAD_MESSAGE.type;
}

export function isQueryPlaybackMessage(message: unknown): boolean {
  return typeOf(message) === QUERY_PLAYBACK_MESSAGE.type;
}

export function isPlaybackMessage(message: unknown): message is PlaybackMessage {
  return (
    typeOf(message) === 'mast:playback' &&
    typeof (message as { playing?: unknown }).playing === 'boolean'
  );
}

function typeOf(message: unknown): unknown {
  return typeof message === 'object' && message !== null
    ? (message as { type?: unknown }).type
    : undefined;
}
