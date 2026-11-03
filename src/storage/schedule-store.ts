import { browser } from 'wxt/browser';
import { DEFAULT_SCHEDULE } from '../core/default-schedule';
import {
  evaluate,
  parseSchedule,
  type Verdict,
  validateSchedule,
  type WeeklySchedule,
} from '../core/schedule';
import { loadUsedMs } from './usage-store';

/** 予約枠を保存する storage.sync のキー */
export const SCHEDULE_KEY = 'schedule';

/** 保存された予約枠を読む。保存されていないか壊れていれば、初期値を返す */
export async function loadSchedule(): Promise<WeeklySchedule> {
  const stored = await browser.storage.sync.get(SCHEDULE_KEY);
  return parseSchedule(stored[SCHEDULE_KEY]) ?? DEFAULT_SCHEDULE;
}

/**
 * 予約枠を保存する。storage.sync なので、同じGoogleアカウントの別の端末にも同期される。
 * 保存すると、Service Worker が storage.onChanged で気づいて判定し直す
 */
export async function saveSchedule(schedule: WeeklySchedule): Promise<void> {
  const errors = validateSchedule(schedule);
  if (errors.length > 0) {
    throw new Error(`予約枠に誤りがあります：${errors.join('、')}`);
  }
  await browser.storage.sync.set({ [SCHEDULE_KEY]: schedule });
}

/** 保存された予約枠と今日の視聴時間で、今見てよいかを判定する */
export async function loadVerdict(now: Date): Promise<Verdict> {
  const [schedule, usedMs] = await Promise.all([loadSchedule(), loadUsedMs(now)]);
  return evaluate(schedule, now, usedMs);
}
