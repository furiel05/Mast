import { DAY_END_MINUTE, DAY_START_MINUTE } from '../../core/day';
import { formatDuration, formatTimeOfDay } from '../../core/format';
import type { DayRule, TimeRange } from '../../core/schedule';

/**
 * 設定画面で1つの曜日に入力する値（docs/spec.md「設定画面」）。
 * 利用者にはルールの種類を選ばせず、この値から種類を決める
 */
export type DayForm = {
  /** 見る時間帯。1日中なら「いつでも」 */
  range: TimeRange;
  /** 1日の上限（分）。上限なしなら null */
  limitMinutes: number | null;
};

/** 時間帯の指定なし（4:00〜翌4:00） */
export const ALL_DAY: TimeRange = { start: DAY_START_MINUTE, end: DAY_END_MINUTE };

/** 初めて「見る」にした曜日の値 */
export const DEFAULT_FORM: DayForm = {
  range: { start: 20 * 60, end: 23 * 60 },
  limitMinutes: null,
};

export function isAllDay(range: TimeRange): boolean {
  return range.start === ALL_DAY.start && range.end === ALL_DAY.end;
}

/** 保存されているルールを、画面に入力する値にする。見ない日は null */
export function toForm(rule: DayRule): DayForm | null {
  switch (rule.type) {
    case 'none':
      return null;
    case 'window':
      return { range: rule.window, limitMinutes: null };
    case 'budget':
      return { range: ALL_DAY, limitMinutes: rule.budgetMinutes };
    case 'combined':
      return { range: rule.window, limitMinutes: rule.budgetMinutes };
  }
}

/** 画面に入力された値をルールにする。見ない日は null を渡す */
export function toRule(form: DayForm | null): DayRule {
  if (form === null) {
    return { type: 'none' };
  }
  const { range, limitMinutes } = form;
  if (limitMinutes === null) {
    return { type: 'window', window: range };
  }
  return isAllDay(range)
    ? { type: 'budget', budgetMinutes: limitMinutes }
    : { type: 'combined', window: range, budgetMinutes: limitMinutes };
}

/** ホイールで選ぶ分。15分刻み（docs/spec.md「設定画面」） */
export const WHEEL_MINUTES: readonly number[] = [0, 15, 30, 45];

/**
 * 時のホイールに並べる時。4時区切りの日の0時から数えるので、24以上は翌日（翌0〜）。
 * 始まりは翌3時台まで、終わりは翌4:00まで選べる
 */
export function hourOptions(edge: 'start' | 'end'): number[] {
  const last = edge === 'start' ? DAY_END_MINUTE / 60 - 1 : DAY_END_MINUTE / 60;
  return Array.from(
    { length: last - DAY_START_MINUTE / 60 + 1 },
    (_, i) => DAY_START_MINUTE / 60 + i,
  );
}

/** 分のホイールに並べる分。15分刻みでない時刻が保存されていても表示できるよう、その分を足す */
export function minuteOptions(minute: number): number[] {
  const current = minute % 60;
  return WHEEL_MINUTES.includes(current)
    ? [...WHEEL_MINUTES]
    : [...WHEEL_MINUTES, current].sort((a, b) => a - b);
}

/** 時と分を合わせる。翌4時台は翌4:00にそろえる（1日の終わりより後にはしない） */
export function joinTime(hour: number, minute: number): number {
  return Math.min(hour * 60 + minute, DAY_END_MINUTE);
}

/** 時のホイールの表示。「20」「翌1」 */
export function formatHour(hour: number): string {
  return hour >= 24 ? `翌${hour - 24}` : String(hour);
}

/**
 * 1日分の設定の意味を文章にする。各曜日の下に出す（docs/spec.md「設定画面」）。
 * 上限が時間帯の長さ以上なら、上限なしと同じ意味になることも書く
 */
export function summarize(form: DayForm): string {
  const { range, limitMinutes } = form;
  const when = isAllDay(range)
    ? 'いつでも'
    : `${formatTimeOfDay(range.start)}〜${formatTimeOfDay(range.end)}`;
  if (limitMinutes === null) {
    return isAllDay(range) ? '1日中いつでも見られます' : `${when} の間なら、いつでも見られます`;
  }
  if (!Number.isFinite(limitMinutes)) {
    return '';
  }
  if (limitMinutes >= range.end - range.start) {
    return `${when} の間なら、いつでも見られます（上限は時間帯より長いので、上限なしと同じです）`;
  }
  const limit = formatDuration(limitMinutes * 60 * 1000);
  return isAllDay(range)
    ? `いつでも、合計${limit}まで見られます`
    : `${when} のうち、合計${limit}まで見られます`;
}
