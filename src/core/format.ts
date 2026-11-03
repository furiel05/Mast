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
