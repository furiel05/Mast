import { DAY_END_MINUTE, DAY_START_MINUTE, type Weekday } from './day';
import type { DayRule, TimeRange, WeeklySchedule } from './schedule';

/**
 * 予約枠の変更の向き（docs/spec.md「広げる・狭めるの判定」）。
 * - same：見てよい範囲が変わらない
 * - narrower：すべての曜日で、見てよい範囲が同じか狭くなる。認証なしで即時反映してよい
 * - wider：どこかの曜日で広がるか、広いか狭いかを比べられない
 */
export type ChangeDirection = 'same' | 'narrower' | 'wider';

export function compareSchedules(current: WeeklySchedule, next: WeeklySchedule): ChangeDirection {
  const days = current.map((rule, weekday) => ({
    before: allowanceOf(rule),
    after: allowanceOf(next[weekday as Weekday]),
  }));
  if (days.some(({ before, after }) => !isWithin(after, before))) {
    return 'wider';
  }
  return days.some(({ before, after }) => !isWithin(before, after)) ? 'narrower' : 'same';
}

/**
 * ルールで見てよい範囲。時間帯と、その中で見てよい合計時間（分）で表す。
 * 何も見られないルールは null
 */
type Allowance = { range: TimeRange; minutes: number } | null;

function allowanceOf(rule: DayRule): Allowance {
  const range = rangeOf(rule);
  if (range === null) {
    return null;
  }
  // 時間帯より長い予算は、時間帯の長さと同じ意味になる
  const length = range.end - range.start;
  const budget = rule.type === 'budget' || rule.type === 'combined' ? rule.budgetMinutes : length;
  const minutes = Math.min(budget, length);
  return minutes > 0 ? { range, minutes } : null;
}

function rangeOf(rule: DayRule): TimeRange | null {
  switch (rule.type) {
    case 'none':
      return null;
    case 'budget':
      return { start: DAY_START_MINUTE, end: DAY_END_MINUTE };
    case 'window':
    case 'combined':
      return rule.window;
  }
}

/** a で見てよい範囲が、すべて b でも見てよい範囲か */
function isWithin(a: Allowance, b: Allowance): boolean {
  if (a === null) {
    return true;
  }
  if (b === null) {
    return false;
  }
  return b.range.start <= a.range.start && a.range.end <= b.range.end && a.minutes <= b.minutes;
}
