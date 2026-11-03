import { DAY_END_MINUTE, DAY_START_MINUTE } from '../../core/day';
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

/**
 * 直接入力された時刻を、4時区切りの日の0時からの分（day.ts 参照）にする。読めなければ null。
 * 「20:00」「20」「2030」「翌1:00」「25:00」を受け付け、4:00より前の時刻は翌日として扱う
 */
export function parseTimeOfDay(text: string): number | null {
  const normalized = text
    .replace(/[０-９：]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s/g, '');
  const match = /^(翌)?(\d{1,2})(?::?(\d{2}))?$/.exec(normalized);
  if (match === null) {
    return null;
  }
  const [, nextDay, h, m] = match;
  const hours = Number(h);
  const minutes = Number(m ?? 0);
  if (minutes >= 60) {
    return null;
  }
  let minute = hours * 60 + minutes;
  if (nextDay !== undefined || minute < DAY_START_MINUTE) {
    minute += 24 * 60;
  }
  return minute >= DAY_START_MINUTE && minute <= DAY_END_MINUTE ? minute : null;
}
