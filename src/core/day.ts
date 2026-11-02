/**
 * 4時区切りの「1日」を扱う。
 * 曜日の判定や予算のリセットは、0時ではなく朝4時を区切りにする（docs/spec.md「1日の区切り」）。
 *
 * 時刻は「その日の0時からの経過分」で表す。0時〜4時前は 24*60 以上になる（深夜1時 = 25*60）。
 */

/** 1日の始まり（朝4時） */
export const DAY_START_MINUTE = 4 * 60;

/** 1日の終わり（翌朝4時） */
export const DAY_END_MINUTE = DAY_START_MINUTE + 24 * 60;

/** 曜日。Date#getDay() と同じく 0 が日曜 */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 時刻を持たない暦の日付。month は 1〜12 */
export type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

/** 4時区切りで見た「今日」と、その中での現在時刻 */
export type LogicalDay = {
  date: CalendarDate;
  weekday: Weekday;
  /** date の0時からの経過分（DAY_START_MINUTE 以上 DAY_END_MINUTE 未満） */
  minute: number;
};

export function toLogicalDay(now: Date): LogicalDay {
  const minute = now.getHours() * 60 + now.getMinutes();
  const calendarDate = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
  if (minute >= DAY_START_MINUTE) {
    return { date: calendarDate, weekday: weekdayOf(calendarDate), minute };
  }
  // 0時〜4時前は、前の日の夜として扱う
  const date = addDays(calendarDate, -1);
  return { date, weekday: weekdayOf(date), minute: minute + 24 * 60 };
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  // 正午で計算するのは、0時が存在しない日（夏時間の開始が0時の地域）でも日付がずれないようにするため
  const d = new Date(date.year, date.month - 1, date.day + days, 12);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

export function weekdayOf(date: CalendarDate): Weekday {
  return new Date(date.year, date.month - 1, date.day, 12).getDay() as Weekday;
}

/**
 * date の0時から minute 分たった時刻を返す。minute は 24*60 以上でもよい（翌日になる）。
 * 存在しない時刻（夏時間の開始で飛ばされる時刻）は、その直後の時刻になる。
 */
export function timeAt(date: CalendarDate, minute: number): Date {
  return new Date(date.year, date.month - 1, date.day, 0, minute);
}

/** 次の区切り（次の朝4時）を返す。予算のリセット時刻に使う */
export function nextDayStart(now: Date): Date {
  const today = toLogicalDay(now);
  return timeAt(addDays(today.date, 1), DAY_START_MINUTE);
}

/** "2026-11-02" の形式にする。日ごとの記録のキーに使う */
export function formatDate(date: CalendarDate): string {
  const mm = String(date.month).padStart(2, '0');
  const dd = String(date.day).padStart(2, '0');
  return `${date.year}-${mm}-${dd}`;
}
