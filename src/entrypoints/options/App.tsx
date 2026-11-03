import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { compareSchedules } from '../../core/compare';
import type { Weekday } from '../../core/day';
import { formatDuration, formatNextAllowed } from '../../core/format';
import {
  type DayRule,
  type Verdict,
  validateSchedule,
  type WeeklySchedule,
} from '../../core/schedule';
import {
  loadSchedule,
  loadVerdict,
  SCHEDULE_KEY,
  saveSchedule,
} from '../../storage/schedule-store';
import { loadUsedMs } from '../../storage/usage-store';
import { DayRuleEditor } from './DayRuleEditor';

/** 月曜始まりで並べる（docs/spec.md「設定画面」）。保存する形は日曜始まり */
const DISPLAY_ORDER: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABELS = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

/** 今の状態を読み直す間隔 */
const REFRESH_INTERVAL_MS = 30 * 1000;

export function App() {
  /** saved：保存されている予約枠、draft：編集中の予約枠 */
  const [schedules, setSchedules] = useState<{
    saved: WeeklySchedule;
    draft: WeeklySchedule;
  } | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    // 保存された予約枠を読み込む。別の端末で変更されて同期されてきたときも呼ぶ。
    // 編集中でなければ表示もそれに合わせ、編集中なら編集内容を残す
    const reload = async () => {
      const schedule = await loadSchedule();
      setSchedules((previous) => ({
        saved: schedule,
        draft: previous === null || previous.draft === previous.saved ? schedule : previous.draft,
      }));
    };
    void reload();

    const onChanged = (changes: Record<string, unknown>, areaName: string): void => {
      if (areaName === 'sync' && SCHEDULE_KEY in changes) {
        void reload();
      }
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  if (schedules === null) {
    return null;
  }
  const { saved, draft } = schedules;
  const setDraft = (next: WeeklySchedule) => setSchedules({ saved, draft: next });

  const errors = validateSchedule(draft);
  const direction = errors.length === 0 ? compareSchedules(saved, draft) : null;

  const updateDay = (weekday: Weekday, rule: DayRule) => {
    const next = [...draft];
    next[weekday] = rule;
    setDraft(next as unknown as WeeklySchedule);
    setMessage('');
  };

  const save = async () => {
    await saveSchedule(draft);
    setSchedules({ saved: draft, draft });
    setMessage('保存しました');
  };

  return (
    <main>
      <h1>Mast 設定</h1>

      <Status />

      <section aria-labelledby="schedule-heading">
        <h2 id="schedule-heading">予約枠</h2>
        <p className="hint">
          1日の区切りは朝4時です。0時を過ぎた時刻は「翌2:00」のように選びます。
        </p>
        {DISPLAY_ORDER.map((weekday) => (
          <DayRuleEditor
            key={weekday}
            label={WEEKDAY_LABELS[weekday] ?? ''}
            rule={draft[weekday]}
            onChange={(rule) => updateDay(weekday, rule)}
          />
        ))}

        {errors.length > 0 && (
          <ul className="errors" role="alert">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
        {direction === 'narrower' && (
          <p className="direction">予約枠を狭める変更です。保存するとすぐに反映されます。</p>
        )}
        {direction === 'wider' && (
          <p className="direction wider">
            予約枠を広げる変更です。承認の仕組みは準備中のため、今は保存するとすぐに反映されます。
          </p>
        )}

        <div className="actions">
          <button
            type="button"
            className="primary"
            disabled={direction === null || direction === 'same'}
            onClick={() => void save()}
          >
            保存する
          </button>
          <button
            type="button"
            disabled={draft === saved}
            onClick={() => {
              setDraft(saved);
              setMessage('');
            }}
          >
            元に戻す
          </button>
          <span role="status">{message}</span>
        </div>
      </section>

      <p className="hint">
        予約枠は、同じGoogleアカウントでログインしているほかのパソコンのChromeにも同期されます。
        同期するには、Chromeの設定の「同期」で「拡張機能」をオンにしてください。
      </p>
    </main>
  );
}

/** 今見られるかと、今日の視聴時間 */
function Status() {
  const [state, setState] = useState<{ verdict: Verdict; usedMs: number; now: Date } | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const now = new Date();
      const [verdict, usedMs] = await Promise.all([loadVerdict(now), loadUsedMs(now)]);
      if (active) {
        setState({ verdict, usedMs, now });
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    // 予約枠の保存や、視聴時間の記録が変わったら読み直す
    const onChanged = () => void refresh();
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      active = false;
      clearInterval(timer);
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  if (state === null) {
    return null;
  }
  const { verdict, usedMs, now } = state;
  return (
    <section className="status" aria-label="今の状態">
      <p className="verdict">
        {verdict.allowed
          ? `今は見られます（${formatNextAllowed(verdict.allowedUntil, now)} まで）`
          : verdict.reason === 'budget-exhausted'
            ? '今日の視聴時間を使い切りました'
            : '今は見られない時間です'}
      </p>
      {!verdict.allowed && verdict.nextAllowedAt !== null && (
        <p>次に見られるのは {formatNextAllowed(verdict.nextAllowedAt, now)} から</p>
      )}
      <p>
        今日の視聴時間：{formatDuration(usedMs)}
        {verdict.allowed &&
          verdict.remainingMs !== null &&
          `（残り ${formatDuration(verdict.remainingMs)}）`}
      </p>
    </section>
  );
}
