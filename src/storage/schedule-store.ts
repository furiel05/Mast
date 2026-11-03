import { browser } from 'wxt/browser';
import { compareSchedules } from '../core/compare';
import { DEFAULT_SCHEDULE } from '../core/default-schedule';
import {
  createPendingChange,
  effectiveSchedule,
  evaluateWithPending,
  isDue,
  type PendingChange,
  parsePendingChange,
} from '../core/pending';
import {
  parseSchedule,
  type Verdict,
  validateSchedule,
  type WeeklySchedule,
} from '../core/schedule';
import { isTotpRegistered, verifyTotpCode } from './totp-store';
import { loadUsedMs } from './usage-store';

/** 予約枠を保存する storage.sync のキー */
export const SCHEDULE_KEY = 'schedule';

/** 予約中の変更（申請から24時間後に反映される、予約枠を広げる変更）を保存する storage.sync のキー */
export const PENDING_CHANGE_KEY = 'pendingChange';

export type ScheduleState = {
  /** 今有効な予約枠。反映される時刻を過ぎた変更は、反映済みとして含める */
  schedule: WeeklySchedule;
  /** まだ反映されていない変更。なければ null */
  pending: PendingChange | null;
};

/**
 * 今有効な予約枠と、予約中の変更を読む。
 * 保存されていないか壊れていれば、予約枠は初期値、予約中の変更はなしとして扱う
 */
export async function loadScheduleState(now: Date): Promise<ScheduleState> {
  const { saved, pending } = await loadStored();
  return {
    schedule: effectiveSchedule(saved, pending, now),
    pending: pending !== null && !isDue(pending, now) ? pending : null,
  };
}

async function loadStored(): Promise<{ saved: WeeklySchedule; pending: PendingChange | null }> {
  const stored = await browser.storage.sync.get([SCHEDULE_KEY, PENDING_CHANGE_KEY]);
  return {
    saved: parseSchedule(stored[SCHEDULE_KEY]) ?? DEFAULT_SCHEDULE,
    pending: parsePendingChange(stored[PENDING_CHANGE_KEY]),
  };
}

export type SaveResult =
  /** すぐに反映した */
  | { status: 'applied' }
  /** 承認され、effectiveAt に反映される */
  | { status: 'requested'; effectiveAt: Date }
  /** 予約枠を広げる変更だが、認証アプリのコードが違う（または入力されていない） */
  | { status: 'wrong-code' };

/**
 * 予約枠の変更を保存する（docs/spec.md「設定変更の流れ」）。storage.sync なので、別の端末にも同期される。
 * - 狭める変更、またはTOTPの初回セットアップ前：すぐに反映する
 * - 広げる変更：認証アプリのコードが合えば、24時間後に反映される変更として予約する
 *
 * どちらでも、予約中だった変更は破棄する。保存すると、Service Worker が storage.onChanged で気づいて判定し直す
 *
 * @param code 認証アプリのコード。広げる変更のときだけ使う
 */
export async function saveSchedule(
  next: WeeklySchedule,
  now: Date,
  code?: string,
): Promise<SaveResult> {
  const errors = validateSchedule(next);
  if (errors.length > 0) {
    throw new Error(`予約枠に誤りがあります：${errors.join('、')}`);
  }
  const { schedule } = await loadScheduleState(now);
  const needsApproval = compareSchedules(schedule, next) === 'wider' && (await isTotpRegistered());

  if (!needsApproval) {
    await browser.storage.sync.set({ [SCHEDULE_KEY]: next });
    await browser.storage.sync.remove(PENDING_CHANGE_KEY);
    return { status: 'applied' };
  }
  if (code === undefined || !(await verifyTotpCode(code, now))) {
    return { status: 'wrong-code' };
  }
  const pending = createPendingChange(next, now);
  // 反映済みの変更があれば、予約枠として書き込んでから予約し直す。そうしないと、
  // 新しい変更が反映されるまでの24時間、反映済みだった変更が消えてしまう
  await browser.storage.sync.set({ [SCHEDULE_KEY]: schedule, [PENDING_CHANGE_KEY]: pending });
  return { status: 'requested', effectiveAt: new Date(pending.effectiveAt) };
}

/** 予約中の変更を取り消す。狭める方向なので認証はいらない（docs/spec.md「変更予約」） */
export async function cancelPendingChange(now: Date): Promise<void> {
  const { schedule } = await loadScheduleState(now);
  // 取り消す前に反映済みになっていたら、それは取り消さずに予約枠として残す
  await browser.storage.sync.set({ [SCHEDULE_KEY]: schedule });
  await browser.storage.sync.remove(PENDING_CHANGE_KEY);
}

/** 保存された予約枠・予約中の変更と、今日の視聴時間で、今見てよいかを判定する */
export async function loadVerdict(now: Date): Promise<Verdict> {
  const [{ saved, pending }, usedMs] = await Promise.all([loadStored(), loadUsedMs(now)]);
  return evaluateWithPending(saved, pending, now, usedMs);
}
