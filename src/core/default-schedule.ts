import type { DayRule, WeeklySchedule } from './schedule';

const WEEKDAY: DayRule = { type: 'window', window: { start: 20 * 60, end: 23 * 60 } };
const WEEKEND: DayRule = { type: 'window', window: { start: 9 * 60, end: 23 * 60 } };

/**
 * 予約枠が保存されていないときに使う初期値（仕様書の例：平日20〜23時、土日9〜23時）。
 * 設定画面（ステップ4）ができるまでは、常にこの値で動く。
 */
export const DEFAULT_SCHEDULE: WeeklySchedule = [
  WEEKEND,
  WEEKDAY,
  WEEKDAY,
  WEEKDAY,
  WEEKDAY,
  WEEKDAY,
  WEEKEND,
];
