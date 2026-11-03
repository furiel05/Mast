const WEEKDAY_SHORT = ['日', '月', '火', '水', '木', '金', '土'] as const;

/**
 * ブロック画面に出す「次に見られる時刻」の文。日付は4時区切りではなく、時計どおりの日付で書く。
 * 例：「今日 20:00」「明日（火）20:00」「11月7日（土）9:00」
 */
export function formatNextAllowed(next: Date, now: Date): string {
  const time = `${next.getHours()}:${String(next.getMinutes()).padStart(2, '0')}`;
  const weekday = WEEKDAY_SHORT[next.getDay()];
  if (isSameDate(next, now)) {
    return `今日 ${time}`;
  }
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
  if (isSameDate(next, tomorrow)) {
    return `明日（${weekday}）${time}`;
  }
  return `${next.getMonth() + 1}月${next.getDate()}日（${weekday}）${time}`;
}

function isSameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * 4時区切りの日の0時からの分（day.ts 参照）を、設定画面に出す時刻にする。
 * 0時以降は「翌2:00」のように書く（docs/spec.md「1日の区切り」）
 */
export function formatTimeOfDay(minute: number): string {
  const nextDay = minute >= 24 * 60;
  const m = nextDay ? minute - 24 * 60 : minute;
  return `${nextDay ? '翌' : ''}${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** 視聴時間を「1時間5分」「23分」のように書く。1分未満は切り捨てる */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}分`;
  }
  return minutes === 0 ? `${hours}時間` : `${hours}時間${minutes}分`;
}
