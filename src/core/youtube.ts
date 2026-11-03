/** ブロックするドメイン。サブドメイン（www.、m. など）も含む */
export const BLOCKED_DOMAINS = ['youtube.com', 'youtube-nocookie.com', 'youtu.be'] as const;

/**
 * BLOCKED_DOMAINS のうち、ブロックしないサブドメイン。
 * - music.youtube.com：動画ではなく音楽を聴くためのサービスなので対象外にする
 * - accounts.youtube.com：Googleアカウントのログイン処理がここを通る。
 *   ブロックすると、GmailなどほかのGoogleのサービスにもログインできなくなる
 */
export const EXCLUDED_DOMAINS = ['music.youtube.com', 'accounts.youtube.com'] as const;

/** ブロックの対象になるYouTubeのURLか */
export function isBlockedYouTubeUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return false;
  }
  const matches = (domain: string) =>
    url.hostname === domain || url.hostname.endsWith(`.${domain}`);
  return BLOCKED_DOMAINS.some(matches) && !EXCLUDED_DOMAINS.some(matches);
}
