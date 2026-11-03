import {
  addDays,
  type CalendarDate,
  DAY_END_MINUTE,
  DAY_START_MINUTE,
  type LogicalDay,
  timeAt,
  toLogicalDay,
  type Weekday,
  weekdayOf,
} from './day';

/**
 * 見てよい時間帯。4時区切りの日の0時からの分で表す（day.ts 参照）。
 * 例：22:00〜翌2:00 = { start: 22 * 60, end: 26 * 60 }
 */
export type TimeRange = {
  start: number;
  end: number;
};

/** 曜日ごとのルール（docs/spec.md「予約枠のルール」） */
export type DayRule =
  | { type: 'none' }
  | { type: 'window'; window: TimeRange }
  | { type: 'budget'; budgetMinutes: number }
  | { type: 'combined'; window: TimeRange; budgetMinutes: number };

/** 1週間分のルール。Date#getDay() と同じく日曜始まりで並べる */
export type WeeklySchedule = readonly [
  DayRule,
  DayRule,
  DayRule,
  DayRule,
  DayRule,
  DayRule,
  DayRule,
];

export type Verdict =
  | {
      allowed: true;
      /**
       * 時間で決まる、今の枠の終わり。この時刻になったら判定し直す。
       * 予算ルールの日は次の区切り（翌朝4時）になる。続けて次の日も見られることがある
       */
      allowedUntil: Date;
      /** 予算の残り（ミリ秒）。予算のないルールなら null */
      remainingMs: number | null;
    }
  | {
      allowed: false;
      reason: 'outside-window' | 'budget-exhausted';
      /** 次に見られる時刻。この先1週間に見られる時間が1つもなければ null */
      nextAllowedAt: Date | null;
    };

const MS_PER_MINUTE = 60 * 1000;

const WEEKDAY_NAMES = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'] as const;

/**
 * 今YouTubeを見てよいかを判定する。
 *
 * @param now 現在時刻
 * @param usedMs 今日（4時区切り）すでに視聴した時間（ミリ秒）。全端末の合計
 */
export function evaluate(schedule: WeeklySchedule, now: Date, usedMs: number): Verdict {
  const today = toLogicalDay(now);
  const rule = schedule[today.weekday];
  const range = allowedRange(rule);
  const budgetMs = budgetMsOf(rule);
  const remainingMs = budgetMs === null ? null : Math.max(0, budgetMs - usedMs);
  const hasBudget = remainingMs === null || remainingMs > 0;
  const inRange = range !== null && range.start <= today.minute && today.minute < range.end;

  if (inRange && hasBudget) {
    return { allowed: true, allowedUntil: timeAt(today.date, range.end), remainingMs };
  }
  return {
    allowed: false,
    reason: inRange ? 'budget-exhausted' : 'outside-window',
    nextAllowedAt: findNextAllowed(schedule, today, hasBudget),
  };
}

function findNextAllowed(
  schedule: WeeklySchedule,
  today: LogicalDay,
  hasBudgetToday: boolean,
): Date | null {
  const range = allowedRange(schedule[today.weekday]);
  if (range !== null && hasBudgetToday && today.minute < range.start) {
    return timeAt(today.date, range.start);
  }
  // 予算は日ごとにリセットされるので、翌日以降は予算が0より大きければ見られる。
  // 7日先まで見るのは、今日と同じ曜日しか見られない場合に来週の同じ曜日を返すため
  for (let offset = 1; offset <= 7; offset++) {
    const date: CalendarDate = addDays(today.date, offset);
    const rule = schedule[weekdayOf(date)];
    const nextRange = allowedRange(rule);
    const budgetMs = budgetMsOf(rule);
    if (nextRange !== null && (budgetMs === null || budgetMs > 0)) {
      return timeAt(date, nextRange.start);
    }
  }
  return null;
}

/** 時間の上で見てよい範囲。予算だけのルールは1日中 */
function allowedRange(rule: DayRule): TimeRange | null {
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

function budgetMsOf(rule: DayRule): number | null {
  switch (rule.type) {
    case 'budget':
    case 'combined':
      return rule.budgetMinutes * MS_PER_MINUTE;
    case 'none':
    case 'window':
      return null;
  }
}

/**
 * 保存されていた値を予約枠として読む。形が違うか、ルールに誤りがあれば null。
 * chrome.storage の値は、古い版の拡張機能が書いたものや壊れたものの可能性があるため、必ずこれを通す
 */
export function parseSchedule(value: unknown): WeeklySchedule | null {
  if (!Array.isArray(value) || value.length !== 7 || !value.every(isDayRule)) {
    return null;
  }
  const schedule = value as unknown as WeeklySchedule;
  return validateSchedule(schedule).length === 0 ? schedule : null;
}

function isDayRule(value: unknown): value is DayRule {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const rule = value as Record<string, unknown>;
  switch (rule.type) {
    case 'none':
      return true;
    case 'window':
      return isTimeRange(rule.window);
    case 'budget':
      return typeof rule.budgetMinutes === 'number';
    case 'combined':
      return isTimeRange(rule.window) && typeof rule.budgetMinutes === 'number';
    default:
      return false;
  }
}

function isTimeRange(value: unknown): value is TimeRange {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const range = value as Record<string, unknown>;
  return typeof range.start === 'number' && typeof range.end === 'number';
}

/** ルールの誤りを、画面に出せる文で返す。誤りがなければ空の配列 */
export function validateSchedule(schedule: WeeklySchedule): string[] {
  return schedule.flatMap((rule, weekday) =>
    validateRule(rule).map((message) => `${WEEKDAY_NAMES[weekday as Weekday]}：${message}`),
  );
}

function validateRule(rule: DayRule): string[] {
  const errors: string[] = [];
  if (rule.type === 'window' || rule.type === 'combined') {
    const { start, end } = rule.window;
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      errors.push('時間帯は分単位で指定してください');
    } else if (start < DAY_START_MINUTE || end > DAY_END_MINUTE) {
      errors.push('時間帯は朝4時から翌朝4時までの間で指定してください');
    } else if (start >= end) {
      errors.push('時間帯の終わりは始まりより後にしてください');
    }
  }
  if (rule.type === 'budget' || rule.type === 'combined') {
    const { budgetMinutes } = rule;
    if (!Number.isInteger(budgetMinutes) || budgetMinutes < 0 || budgetMinutes > 24 * 60) {
      errors.push('予算は0〜1440分の整数で指定してください');
    }
  }
  return errors;
}
