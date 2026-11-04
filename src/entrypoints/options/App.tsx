import { type FormEvent, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { compareSchedules } from '../../core/compare';
import type { Weekday } from '../../core/day';
import { describeRule, formatDuration, formatNextAllowed } from '../../core/format';
import type { PendingChange } from '../../core/pending';
import {
  type DayRule,
  type Verdict,
  validateSchedule,
  type WeeklySchedule,
} from '../../core/schedule';
import {
  cancelPendingChange,
  loadScheduleState,
  loadVerdict,
  PENDING_CHANGE_KEY,
  SCHEDULE_KEY,
  saveSchedule,
} from '../../storage/schedule-store';
import { isTotpRegistered, TOTP_SECRET_KEY } from '../../storage/totp-store';
import { loadUsedMs } from '../../storage/usage-store';
import { DayRuleEditor } from './DayRuleEditor';
import { TotpSetup } from './TotpSetup';

/** 月曜始まりで並べる（docs/spec.md「設定画面」）。保存する形は日曜始まり */
const DISPLAY_ORDER: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABELS = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

/** 今の状態を読み直す間隔 */
const REFRESH_INTERVAL_MS = 30 * 1000;

/** 読み直すきっかけになる storage.sync のキー */
const WATCHED_KEYS = [SCHEDULE_KEY, PENDING_CHANGE_KEY, TOTP_SECRET_KEY];

type Settings = {
  /** 今有効な予約枠 */
  saved: WeeklySchedule;
  /** 編集中の予約枠 */
  draft: WeeklySchedule;
  pending: PendingChange | null;
  /** 承認コードの初回セットアップが済んでいるか */
  totpRegistered: boolean;
};

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => {
    // 保存された設定を読み込む。別の端末で変更されて同期されてきたときも呼ぶ。
    // 編集中でなければ表示もそれに合わせ、編集中なら編集内容を残す
    const reload = async () => {
      const [{ schedule, pending }, totpRegistered] = await Promise.all([
        loadScheduleState(new Date()),
        isTotpRegistered(),
      ]);
      setSettings((previous) => ({
        saved: schedule,
        draft: previous === null || previous.draft === previous.saved ? schedule : previous.draft,
        pending,
        totpRegistered,
      }));
    };
    void reload();

    const onChanged = (changes: Record<string, unknown>, areaName: string): void => {
      if (areaName === 'sync' && WATCHED_KEYS.some((key) => key in changes)) {
        void reload();
      }
    };
    browser.storage.onChanged.addListener(onChanged);
    // 予約中の変更が反映される時刻になったら、反映後の予約枠を表示する。
    // 反映されても保存し直されないので、storage.onChanged は起きない
    const timer = setInterval(() => void reload(), REFRESH_INTERVAL_MS);
    return () => {
      browser.storage.onChanged.removeListener(onChanged);
      clearInterval(timer);
    };
  }, []);

  if (settings === null) {
    return null;
  }
  const { saved, draft, pending, totpRegistered } = settings;
  const setDraft = (next: WeeklySchedule) => setSettings({ ...settings, draft: next });

  const errors = validateSchedule(draft);
  const direction = errors.length === 0 ? compareSchedules(saved, draft) : null;
  const needsCode = direction === 'wider' && totpRegistered;

  const updateDay = (weekday: Weekday, rule: DayRule) => {
    const next = [...draft];
    next[weekday] = rule;
    setDraft(next as unknown as WeeklySchedule);
    setMessage('');
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const now = new Date();
    const result = await saveSchedule(draft, now, needsCode ? code : undefined);
    switch (result.status) {
      case 'applied':
        setSettings({ ...settings, saved: draft, pending: null });
        setMessage('保存しました');
        break;
      case 'requested':
        setSettings({
          ...settings,
          draft: saved,
          pending: {
            schedule: draft,
            requestedAt: now.getTime(),
            effectiveAt: result.effectiveAt.getTime(),
          },
        });
        setMessage(`申請しました。${formatNextAllowed(result.effectiveAt, now)} に反映されます`);
        break;
      case 'wrong-code':
        setMessage('コードが違います。認証アプリに今表示されているコードを入力してください');
        return;
    }
    setCode('');
  };

  return (
    <main>
      <h1>Mast 設定</h1>

      <Status />

      {!totpRegistered && <TotpSetup />}

      {pending !== null && (
        <PendingChangeCard
          current={saved}
          pending={pending}
          onCancel={async () => {
            await cancelPendingChange(new Date());
            setSettings({ ...settings, pending: null });
            setMessage('');
          }}
        />
      )}

      <section aria-labelledby="schedule-heading">
        <h2 id="schedule-heading">予約枠</h2>
        <p className="hint">
          1日の区切りは朝4時です。0時を過ぎた時刻は「翌1:00」のように選びます。
        </p>
        <div className="days">
          {DISPLAY_ORDER.map((weekday) => (
            <DayRuleEditor
              key={weekday}
              label={WEEKDAY_LABELS[weekday] ?? ''}
              rule={draft[weekday]}
              onChange={(rule) => updateDay(weekday, rule)}
            />
          ))}
        </div>

        {errors.length > 0 && (
          <ul className="errors" role="alert">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
        {direction !== null && direction !== 'same' && (
          <p className={`direction ${direction}`}>
            {directionMessage(direction, totpRegistered)}
            {pending !== null &&
              (needsCode
                ? '予約中の変更は、この変更に置き換わります。'
                : '保存すると、予約中の変更は取り消されます。')}
          </p>
        )}

        <form className="actions" onSubmit={(e) => void save(e)}>
          {needsCode && (
            <input
              className="code"
              aria-label="認証アプリのコード"
              placeholder="6桁のコード"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          )}
          <button
            type="submit"
            className="primary"
            disabled={direction === null || direction === 'same'}
          >
            {needsCode ? '申請する' : '保存する'}
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
        </form>
      </section>

      <p className="hint">
        予約枠は、同じGoogleアカウントでログインしているほかのパソコンのChromeにも同期されます。
        同期するには、Chromeの設定の「同期」で「拡張機能」をオンにしてください。
      </p>
      {totpRegistered && (
        <p className="hint">
          承認コードは設定済みです。予約枠を広げる変更には、認証アプリのコードが必要です。
        </p>
      )}
    </main>
  );
}

function directionMessage(direction: 'narrower' | 'wider', totpRegistered: boolean): string {
  if (direction === 'narrower') {
    return '予約枠を狭める変更です。保存するとすぐに反映されます。';
  }
  return totpRegistered
    ? '予約枠を広げる変更です。認証アプリのコードを入力して申請すると、24時間後に反映されます。'
    : '予約枠を広げる変更です。承認コードを設定するまでは、保存するとすぐに反映されます。';
}

/** 予約中の変更の内容と、反映される日時（docs/spec.md「変更予約」） */
function PendingChangeCard({
  current,
  pending,
  onCancel,
}: {
  current: WeeklySchedule;
  pending: PendingChange;
  onCancel: () => Promise<void>;
}) {
  const changedDays = DISPLAY_ORDER.filter(
    (weekday) => describeRule(current[weekday]) !== describeRule(pending.schedule[weekday]),
  );
  return (
    <section className="card pending" aria-labelledby="pending-heading">
      <h2 id="pending-heading">予約中の変更</h2>
      <p>{formatNextAllowed(new Date(pending.effectiveAt), new Date())} に反映されます。</p>
      <ul>
        {changedDays.map((weekday) => (
          <li key={weekday}>
            {WEEKDAY_LABELS[weekday]}：{describeRule(current[weekday])} →{' '}
            {describeRule(pending.schedule[weekday])}
          </li>
        ))}
      </ul>
      <div className="actions">
        <button type="button" onClick={() => void onCancel()}>
          取り消す
        </button>
        <span className="hint">取り消しには認証はいりません。</span>
      </div>
    </section>
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
    <section className="card status" aria-label="今の状態">
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
