import { addDays, type CalendarDate, formatDate, nextDayStart, toLogicalDay } from './day';

/**
 * 視聴時間の記録。storage.sync に、日付（4時区切り）と端末ごとに別のキーで保存する。
 * 例：usage_2026-11-02_<端末ID> = その端末がその日に見たミリ秒
 *
 * 各端末が自分のキーにしか書かないので、同期しても上書きの競合が起きない（docs/spec.md「設定の同期」）。
 */

/** 記録を残す日数。これより前の記録は消す（storage.sync は512件までしか保存できないため） */
export const USAGE_RETENTION_DAYS = 7;

const USAGE_KEY_PATTERN = /^usage_(\d{4}-\d{2}-\d{2})_/;

export function usageKey(date: CalendarDate, deviceId: string): string {
  return `usage_${formatDate(date)}_${deviceId}`;
}

/** 記録のキーから日付の部分（"2026-11-02"）を取り出す。記録のキーでなければ null */
function dateOfKey(key: string): string | null {
  return USAGE_KEY_PATTERN.exec(key)?.[1] ?? null;
}

/** 記録の値を読む。古い版や壊れた値は 0 とみなす */
export function usageMsOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/** 保存されているすべての項目から、date の視聴時間を全端末分合計する */
export function sumUsage(items: Record<string, unknown>, date: CalendarDate): number {
  const target = formatDate(date);
  let total = 0;
  for (const [key, value] of Object.entries(items)) {
    if (dateOfKey(key) === target) {
      total += usageMsOf(value);
    }
  }
  return total;
}

/** 消してよい古い記録のキー。今日を含めて USAGE_RETENTION_DAYS + 1 日分を残す */
export function staleUsageKeys(keys: readonly string[], today: CalendarDate): string[] {
  // "2026-11-02" の形は、文字列のまま比べても日付の前後と一致する
  const oldest = formatDate(addDays(today, -USAGE_RETENTION_DAYS));
  return keys.filter((key) => {
    const date = dateOfKey(key);
    return date !== null && date < oldest;
  });
}

/**
 * from〜to の視聴時間を、4時区切りの日ごとに分ける。
 * 4時をまたいで再生していたとき、前の日と次の日の予算にそれぞれ振り分けるため
 */
export function splitByDay(from: Date, to: Date): { date: CalendarDate; ms: number }[] {
  const parts: { date: CalendarDate; ms: number }[] = [];
  let start = from;
  while (start < to) {
    const dayEnd = nextDayStart(start);
    const end = dayEnd < to ? dayEnd : to;
    parts.push({ date: toLogicalDay(start).date, ms: end.getTime() - start.getTime() });
    start = end;
  }
  return parts;
}
