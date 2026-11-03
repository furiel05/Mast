import { formatDate, toLogicalDay } from './day';
import { evaluate, parseSchedule, type Verdict, type WeeklySchedule } from './schedule';

/** 予約枠を広げる変更が反映されるまでの時間（docs/spec.md「設定変更と承認」） */
export const APPROVAL_DELAY_MS = 24 * 60 * 60 * 1000;

/** 承認された、予約枠を広げる変更（docs/spec.md「変更予約」）。時刻はエポックミリ秒 */
export type PendingChange = {
  schedule: WeeklySchedule;
  requestedAt: number;
  /** この時刻から schedule が有効になる */
  effectiveAt: number;
};

/** requestedAt に申請された変更を作る */
export function createPendingChange(schedule: WeeklySchedule, requestedAt: Date): PendingChange {
  const at = requestedAt.getTime();
  return { schedule, requestedAt: at, effectiveAt: at + APPROVAL_DELAY_MS };
}

/** 保存されていた値を予約中の変更として読む。形が違うか、予約枠に誤りがあれば null */
export function parsePendingChange(value: unknown): PendingChange | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const change = value as Record<string, unknown>;
  const schedule = parseSchedule(change.schedule);
  const { requestedAt, effectiveAt } = change;
  if (schedule === null || typeof requestedAt !== 'number' || typeof effectiveAt !== 'number') {
    return null;
  }
  return { schedule, requestedAt, effectiveAt };
}

export function isDue(pending: PendingChange, now: Date): boolean {
  return pending.effectiveAt <= now.getTime();
}

/**
 * now の時点で有効な予約枠。反映される時刻を過ぎた変更は、保存し直されていなくても反映済みとして扱う
 *
 * @param saved 保存されている予約枠
 */
export function effectiveSchedule(
  saved: WeeklySchedule,
  pending: PendingChange | null,
  now: Date,
): WeeklySchedule {
  return pending !== null && isDue(pending, now) ? pending.schedule : saved;
}

/**
 * 予約中の変更も考えて、今見てよいかを判定する。
 * 見られないときの「次に見られる時刻」は、変更が反映されたあとの予約枠で早まることがある。
 * 見られるときの allowedUntil は今の予約枠のまま返す。反映される時刻に判定し直すと延びる
 */
export function evaluateWithPending(
  saved: WeeklySchedule,
  pending: PendingChange | null,
  now: Date,
  usedMs: number,
): Verdict {
  const verdict = evaluate(effectiveSchedule(saved, pending, now), now, usedMs);
  if (verdict.allowed || pending === null || isDue(pending, now)) {
    return verdict;
  }
  // 反映される前に今の予約枠で見られるなら、それが次に見られる時刻
  if (verdict.nextAllowedAt !== null && verdict.nextAllowedAt.getTime() < pending.effectiveAt) {
    return verdict;
  }
  // 反映されたあとは変更後の予約枠で決まる。それまで見られないので、同じ日なら視聴時間は今のまま
  const effectiveAt = new Date(pending.effectiveAt);
  const sameDay = formatDate(toLogicalDay(effectiveAt).date) === formatDate(toLogicalDay(now).date);
  const after = evaluate(pending.schedule, effectiveAt, sameDay ? usedMs : 0);
  return { ...verdict, nextAllowedAt: after.allowed ? effectiveAt : after.nextAllowedAt };
}
