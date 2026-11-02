/**
 * 翌日0時（ローカル時刻）を返す。
 * 予算のリセットや、予約枠変更の反映時刻に使う。
 *
 * 0時が存在しない日（夏時間の開始が0時の地域）は、その日の最初の時刻になる。
 */
export function startOfNextDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
}
