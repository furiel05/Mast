import { DAY_END_MINUTE, DAY_START_MINUTE } from '../../core/day';
import { formatTimeOfDay } from '../../core/format';
import type { DayRule, TimeRange } from '../../core/schedule';

const TYPE_LABELS: Record<DayRule['type'], string> = {
  none: '見ない日',
  window: '時間帯',
  budget: '予算',
  combined: '時間帯＋予算',
};

/** 時刻は15分刻みで選ぶ（docs/spec.md「設定画面」） */
const TIME_STEP_MINUTES = 15;

const TIME_OPTIONS = Array.from(
  { length: (DAY_END_MINUTE - DAY_START_MINUTE) / TIME_STEP_MINUTES + 1 },
  (_, i) => DAY_START_MINUTE + i * TIME_STEP_MINUTES,
);

/** 種類を切り替えたときの初期値。切り替える前のルールに時間帯や予算があれば、それを引き継ぐ */
const DEFAULT_WINDOW: TimeRange = { start: 20 * 60, end: 23 * 60 };
const DEFAULT_BUDGET_MINUTES = 60;

function changeType(rule: DayRule, type: DayRule['type']): DayRule {
  const window = 'window' in rule ? rule.window : DEFAULT_WINDOW;
  const budgetMinutes = 'budgetMinutes' in rule ? rule.budgetMinutes : DEFAULT_BUDGET_MINUTES;
  switch (type) {
    case 'none':
      return { type };
    case 'window':
      return { type, window };
    case 'budget':
      return { type, budgetMinutes };
    case 'combined':
      return { type, window, budgetMinutes };
  }
}

type Props = {
  /** 「月曜日」など */
  label: string;
  rule: DayRule;
  onChange: (rule: DayRule) => void;
};

/** 1つの曜日のルールを編集する行 */
export function DayRuleEditor({ label, rule, onChange }: Props) {
  return (
    <fieldset className="day">
      <legend>{label}</legend>
      <select
        aria-label={`${label}の種類`}
        value={rule.type}
        onChange={(e) => onChange(changeType(rule, e.target.value as DayRule['type']))}
      >
        {Object.entries(TYPE_LABELS).map(([type, text]) => (
          <option key={type} value={type}>
            {text}
          </option>
        ))}
      </select>

      {'window' in rule && (
        <span className="window">
          <TimeSelect
            label={`${label}の開始`}
            value={rule.window.start}
            onChange={(start) => onChange({ ...rule, window: { ...rule.window, start } })}
          />
          〜
          <TimeSelect
            label={`${label}の終了`}
            value={rule.window.end}
            onChange={(end) => onChange({ ...rule, window: { ...rule.window, end } })}
          />
        </span>
      )}

      {'budgetMinutes' in rule && (
        <span className="budget">
          {rule.type === 'combined' && 'のうち'}
          <input
            type="number"
            aria-label={`${label}の予算（分）`}
            min={0}
            max={24 * 60}
            step={5}
            value={Number.isNaN(rule.budgetMinutes) ? '' : rule.budgetMinutes}
            onChange={(e) => onChange({ ...rule, budgetMinutes: e.target.valueAsNumber })}
          />
          分まで
        </span>
      )}
    </fieldset>
  );
}

function TimeSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (minute: number) => void;
}) {
  // 15分刻みでない時刻が保存されていても、そのまま表示できるようにする
  const options = TIME_OPTIONS.includes(value)
    ? TIME_OPTIONS
    : [...TIME_OPTIONS, value].sort((a, b) => a - b);
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {options.map((minute) => (
        <option key={minute} value={minute}>
          {formatTimeOfDay(minute)}
        </option>
      ))}
    </select>
  );
}
