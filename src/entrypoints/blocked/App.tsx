import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { formatNextAllowed } from '../../core/format';
import type { Verdict } from '../../core/schedule';
import { isBlockedYouTubeUrl } from '../../core/youtube';
import { loadVerdict } from '../../storage/schedule-store';

/** 見られる時間になったかを確かめる間隔 */
const REFRESH_INTERVAL_MS = 30 * 1000;

/** ブロック前に開こうとしていたURL（# 以降）。YouTube以外のURLは使わない */
function originalUrl(): string | null {
  const url = decodeURIComponent(location.hash.slice(1));
  return isBlockedYouTubeUrl(url) ? url : null;
}

/** 他サイトに埋め込まれたYouTubeの代わりに表示されているか */
const isEmbedded = window.top !== window;

export function App() {
  const [state, setState] = useState<{ verdict: Verdict; now: Date } | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const now = new Date();
      const verdict = await loadVerdict(now);
      if (active) {
        setState({ verdict, now });
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const closeTab = async () => {
    const tab = await browser.tabs.getCurrent();
    if (tab?.id !== undefined) {
      await browser.tabs.remove(tab.id);
    }
  };

  if (state === null) {
    return null;
  }

  if (state.verdict.allowed) {
    const url = originalUrl();
    return (
      <main className={isEmbedded ? 'embedded' : undefined}>
        <h1>見られる時間になりました</h1>
        {url !== null && (
          <p>
            <a href={url} target={isEmbedded ? '_top' : undefined}>
              元のページを開く
            </a>
          </p>
        )}
      </main>
    );
  }

  const { reason, nextAllowedAt } = state.verdict;
  return (
    <main className={isEmbedded ? 'embedded' : undefined}>
      <h1>
        {reason === 'budget-exhausted'
          ? '今日の視聴時間を使い切りました'
          : '今はYouTubeを見られない時間です'}
      </h1>
      <p className="next">
        {nextAllowedAt === null
          ? '見られる時間が設定されていません'
          : `次に見られるのは ${formatNextAllowed(nextAllowedAt, state.now)} から`}
      </p>
      {!isEmbedded && (
        <button type="button" onClick={() => void closeTab()}>
          タブを閉じる
        </button>
      )}
    </main>
  );
}
