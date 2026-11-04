import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { formatDuration, formatTimeOfDay } from '../../core/format';
import type { DayRule, TimeRange } from '../../core/schedule';
import {
  ALL_DAY,
  type DayForm,
  DEFAULT_FORM,
  formatHour,
  hourOptions,
  isAllDay,
  joinTime,
  minuteOptions,
  summarize,
  toForm,
  toRule,
} from './day-form';

/**
 * 1日の上限のボタン（分）。null は上限なし。
 * 選びにくくならないよう少なくし、2時間を超える値はボタンにしない（docs/spec.md「設定画面」）
 */
const LIMIT_PRESETS: readonly (number | null)[] = [null, 30, 60, 120];
/** 「その他」を選んだときに、まだ上限がなければ入れておく値 */
const DEFAULT_OTHER_LIMIT = 90;

/** ホイールの1行の高さ（px）。style.css の .wheel と合わせる */
const WHEEL_ITEM_HEIGHT = 32;

type Props = {
  /** 「月曜日」など */
  label: string;
  rule: DayRule;
  onChange: (rule: DayRule) => void;
};

/** 1つの曜日の予約枠を編集する行。見るかどうか、時間帯、1日の上限から、ルールの種類が決まる */
export function DayRuleEditor({ label, rule, onChange }: Props) {
  const form = toForm(rule);
  // 見るのスイッチをオフにしてからオンに戻したとき、オフにする前の値に戻すため
  const lastForm = useRef<DayForm>(form ?? DEFAULT_FORM);
  if (form !== null) {
    lastForm.current = form;
  }
  const update = (next: Partial<DayForm>) => onChange(toRule({ ...lastForm.current, ...next }));

  return (
    <fieldset className="day day-grid">
      {/* 枠の上に置かれる legend は grid に並ばないので、読み上げ用にして、見える名前は別に書く */}
      <legend className="sr-only">{label}</legend>
      <span className="day-name" aria-hidden="true">
        {label}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        aria-label={`${label}に見る`}
        aria-checked={form !== null}
        checked={form !== null}
        onChange={(e) => onChange(toRule(e.target.checked ? lastForm.current : null))}
      />
      {form === null ? (
        <span className="off">見ない日</span>
      ) : (
        <div>
          <div className="fields">
            <div className="field">
              <span className="field-label">見てよい時間帯</span>
              <RangePicker
                label={label}
                range={form.range}
                onChange={(range) => update({ range })}
              />
            </div>
            <LimitPicker
              label={label}
              limitMinutes={form.limitMinutes}
              onChange={(limitMinutes) => update({ limitMinutes })}
            />
          </div>
          <p className="summary">→ {summarize(form)}</p>
        </div>
      )}
    </fieldset>
  );
}

/** 時間帯のボタン。押すと、開始と終了の時刻をホイールで選ぶ画面が開く */
function RangePicker({
  label,
  range,
  onChange,
}: {
  label: string;
  range: TimeRange;
  onChange: (range: TimeRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // 「いつでも」をオフに戻したとき、オンにする前の時間帯に戻すため
  const lastRange = useRef<TimeRange>(isAllDay(range) ? DEFAULT_FORM.range : range);
  if (!isAllDay(range)) {
    lastRange.current = range;
  }

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  // 外側を押すか Esc キーで閉じる
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const text = isAllDay(range)
    ? 'いつでも'
    : `${formatTimeOfDay(range.start)} 〜 ${formatTimeOfDay(range.end)}`;
  return (
    <div className="range-picker" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        className="select-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}の時間帯（${text}）`}
        onClick={() => setOpen(!open)}
      >
        {text}
        <span className="chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div
          className="popover"
          role="dialog"
          aria-label={`${label}の時間帯`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
            }
          }}
        >
          <label className="all-day">
            <input
              type="checkbox"
              role="switch"
              className="switch"
              aria-checked={isAllDay(range)}
              checked={isAllDay(range)}
              onChange={(e) => onChange(e.target.checked ? ALL_DAY : lastRange.current)}
            />
            いつでも（時間帯を決めない）
          </label>
          {!isAllDay(range) && (
            <div className="wheels">
              <TimeWheel
                label={`${label}の開始`}
                caption="開始"
                edge="start"
                minute={range.start}
                onChange={(start) => onChange({ ...range, start })}
              />
              <span className="wheel-dash" aria-hidden="true">
                〜
              </span>
              <TimeWheel
                label={`${label}の終了`}
                caption="終了"
                edge="end"
                minute={range.end}
                onChange={(end) => onChange({ ...range, end })}
              />
            </div>
          )}
          {range.start >= range.end && (
            <p className="field-error">終わりは始まりより後にしてください</p>
          )}
          <div className="popover-actions">
            <button type="button" onClick={close}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 1つの時刻を、時と分の2つのホイールで選ぶ */
function TimeWheel({
  label,
  caption,
  edge,
  minute,
  onChange,
}: {
  label: string;
  caption: string;
  edge: 'start' | 'end';
  minute: number;
  onChange: (minute: number) => void;
}) {
  const hour = Math.floor(minute / 60);
  const minuteOfHour = minute % 60;
  return (
    <div className="time-wheel">
      <span className="wheel-caption">{caption}</span>
      <div className="wheel-pair">
        <WheelColumn
          label={`${label}（時）`}
          options={hourOptions(edge).map((h) => ({ value: h, text: formatHour(h) }))}
          value={hour}
          onChange={(h) => onChange(joinTime(h, minuteOfHour))}
        />
        <span className="wheel-colon" aria-hidden="true">
          :
        </span>
        <WheelColumn
          label={`${label}（分）`}
          options={minuteOptions(minute).map((m) => ({
            value: m,
            text: String(m).padStart(2, '0'),
          }))}
          value={minuteOfHour}
          onChange={(m) => onChange(joinTime(hour, m))}
        />
      </div>
    </div>
  );
}

/**
 * スクロールして選ぶ列。真ん中に来た値を選ぶ。項目のクリックや、上下キーでも選べる。
 * スクロールの途中では選び直さず、止まったとき（scrollend）に選ぶ。途中で選ぶと、
 * 値に合わせてスクロール位置を直す処理と、慣性のスクロールがぶつかるため
 */
function WheelColumn({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: number; text: string }[];
  value: number;
  onChange: (value: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [centered, setCentered] = useState(index);
  const indexAt = (scrollTop: number) =>
    Math.min(Math.max(Math.round(scrollTop / WHEEL_ITEM_HEIGHT), 0), options.length - 1);

  // 値が変わったら、その値が真ん中に来るようにスクロールする
  useEffect(() => {
    const el = ref.current;
    const top = index * WHEEL_ITEM_HEIGHT;
    if (el !== null && Math.abs(el.scrollTop - top) > 1) {
      el.scrollTop = top;
    }
    setCentered(index);
  }, [index]);

  useEffect(() => {
    const el = ref.current;
    if (el === null) {
      return;
    }
    const onScrollEnd = () => {
      const option = options[indexAt(el.scrollTop)];
      if (option !== undefined && option.value !== value) {
        onChange(option.value);
      }
    };
    el.addEventListener('scrollend', onScrollEnd);
    return () => el.removeEventListener('scrollend', onScrollEnd);
  });

  const select = (i: number) => {
    const option = options[Math.min(Math.max(i, 0), options.length - 1)];
    if (option !== undefined && option.value !== value) {
      onChange(option.value);
    }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = { ArrowUp: index - 1, ArrowDown: index + 1, Home: 0, End: options.length - 1 }[
      e.key
    ];
    if (next !== undefined) {
      e.preventDefault();
      select(next);
    }
  };

  return (
    <div
      ref={ref}
      className="wheel"
      role="listbox"
      tabIndex={0}
      aria-label={label}
      aria-activedescendant={`${id}-${index}`}
      onKeyDown={onKeyDown}
      onScroll={(e) => setCentered(indexAt(e.currentTarget.scrollTop))}
    >
      {options.map((option, i) => (
        // biome-ignore lint/a11y/useKeyWithClickEvents: キーボードでは、列（listbox）の上下キーで選ぶ
        <div
          key={option.value}
          id={`${id}-${i}`}
          role="option"
          // 列（listbox）がフォーカスを持ち、aria-activedescendant で選ばれている項目を伝える
          tabIndex={-1}
          aria-selected={i === index}
          className={i === centered ? 'centered' : undefined}
          onClick={() => select(i)}
        >
          {option.text}
        </div>
      ))}
    </div>
  );
}

/** 1日の上限。よく使う値はボタンで、それ以外は「その他」で分を入力する */
function LimitPicker({
  label,
  limitMinutes,
  onChange,
}: {
  label: string;
  limitMinutes: number | null;
  onChange: (limitMinutes: number | null) => void;
}) {
  const [otherChosen, setOtherChosen] = useState(false);
  const isOther = otherChosen || !LIMIT_PRESETS.includes(limitMinutes);
  return (
    <fieldset className="field limit">
      <legend className="field-label">1日に見てよい時間（上限）</legend>
      <div className="segments">
        {LIMIT_PRESETS.map((preset) => (
          <label key={preset ?? 'none'} className="segment">
            <input
              type="radio"
              name={`${label}-limit`}
              checked={!isOther && limitMinutes === preset}
              onChange={() => {
                setOtherChosen(false);
                onChange(preset);
              }}
            />
            {preset === null ? '上限なし' : formatDuration(preset * 60 * 1000)}
          </label>
        ))}
        <label className="segment">
          <input
            type="radio"
            name={`${label}-limit`}
            checked={isOther}
            onChange={() => {
              setOtherChosen(true);
              onChange(limitMinutes ?? DEFAULT_OTHER_LIMIT);
            }}
          />
          その他
        </label>
      </div>
      {isOther && (
        <span className="other">
          <input
            type="number"
            aria-label={`${label}の1日の上限（分）`}
            min={1}
            max={24 * 60}
            step={5}
            value={limitMinutes === null || Number.isNaN(limitMinutes) ? '' : limitMinutes}
            onChange={(e) => onChange(e.target.valueAsNumber)}
          />
          分まで
        </span>
      )}
    </fieldset>
  );
}
