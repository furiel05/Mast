import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react';
import { DAY_END_MINUTE, DAY_START_MINUTE } from '../../core/day';
import { formatDuration, formatTimeOfDay } from '../../core/format';
import type { DayRule, TimeRange } from '../../core/schedule';
import {
  ALL_DAY,
  type DayForm,
  DEFAULT_FORM,
  isAllDay,
  parseTimeOfDay,
  toForm,
  toRule,
} from './day-form';

/** ドラッグと矢印キーで動かす単位（分） */
const STEP_MINUTES = 15;
/** PageUp・PageDown で動かす単位（分） */
const PAGE_MINUTES = 60;
const DAY_LENGTH = DAY_END_MINUTE - DAY_START_MINUTE;

/**
 * 1日の上限のボタン（分）。null は上限なし。
 * 選びにくくならないよう少なくし、2時間を超える値はボタンにしない（docs/spec.md「設定画面」）
 */
const LIMIT_PRESETS: readonly (number | null)[] = [null, 30, 60, 120];
/** 「その他」を選んだときに、まだ上限がなければ入れておく値 */
const DEFAULT_OTHER_LIMIT = 90;

/** 帯の上の目盛り（4時間ごと） */
const AXIS_HOURS = [4, 8, 12, 16, 20, 24, 28];

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
        <>
          <div>
            <Timeline label={label} range={form.range} onChange={(range) => update({ range })} />
            <div className="range-text">
              <TimeText
                label={`${label}の開始`}
                minute={form.range.start}
                onCommit={(start) => update({ range: { ...form.range, start } })}
              />
              〜
              <TimeText
                label={`${label}の終了`}
                minute={form.range.end}
                onCommit={(end) => update({ range: { ...form.range, end } })}
              />
              {isAllDay(form.range) ? (
                <span className="all-day">いつでも</span>
              ) : (
                <button type="button" className="link" onClick={() => update({ range: ALL_DAY })}>
                  いつでもにする
                </button>
              )}
            </div>
          </div>
          <LimitPicker
            label={label}
            limitMinutes={form.limitMinutes}
            rangeMinutes={form.range.end - form.range.start}
            onChange={(limitMinutes) => update({ limitMinutes })}
          />
        </>
      )}
    </fieldset>
  );
}

/** 曜日の行の上に置く、列の見出しと時刻の目盛り */
export function DayGridHeader() {
  return (
    <div className="day-grid day-header" aria-hidden="true">
      <span />
      <span>見る</span>
      <div className="axis">
        {AXIS_HOURS.map((hour) => (
          <span key={hour} style={{ left: `${percentOf(hour * 60)}%` }}>
            {hour === 28 ? '翌4:00' : `${hour % 24}:00`}
          </span>
        ))}
      </div>
      <span>1日の上限</span>
    </div>
  );
}

function percentOf(minute: number): number {
  return ((minute - DAY_START_MINUTE) / DAY_LENGTH) * 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

type Handle = 'start' | 'end';

/** 4:00〜翌4:00 の帯。両端をドラッグするか、矢印キーで時間帯を変える */
function Timeline({
  label,
  range,
  onChange,
}: {
  label: string;
  range: TimeRange;
  onChange: (range: TimeRange) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<Handle | null>(null);

  const move = (handle: Handle, minute: number) => {
    // 始まりと終わりが入れ替わったり重なったりしないよう、15分以上あける
    if (handle === 'start') {
      onChange({ ...range, start: clamp(minute, DAY_START_MINUTE, range.end - STEP_MINUTES) });
    } else {
      onChange({ ...range, end: clamp(minute, range.start + STEP_MINUTES, DAY_END_MINUTE) });
    }
  };

  const minuteAt = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0) {
      return DAY_START_MINUTE;
    }
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    return DAY_START_MINUTE + Math.round((ratio * DAY_LENGTH) / STEP_MINUTES) * STEP_MINUTES;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const minute = minuteAt(e.clientX);
    // つまみを押したらそのつまみ、帯を押したら近いほうのつまみを動かす
    const handle =
      ((e.target as HTMLElement).dataset.handle as Handle | undefined) ??
      (Math.abs(minute - range.start) <= Math.abs(minute - range.end) ? 'start' : 'end');
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(handle);
    move(handle, minute);
  };

  const onKeyDown = (handle: Handle) => (e: KeyboardEvent<HTMLDivElement>) => {
    const current = range[handle];
    const next = {
      ArrowLeft: current - STEP_MINUTES,
      ArrowDown: current - STEP_MINUTES,
      ArrowRight: current + STEP_MINUTES,
      ArrowUp: current + STEP_MINUTES,
      PageDown: current - PAGE_MINUTES,
      PageUp: current + PAGE_MINUTES,
      Home: DAY_START_MINUTE,
      End: DAY_END_MINUTE,
    }[e.key];
    if (next !== undefined) {
      e.preventDefault();
      move(handle, next);
    }
  };

  const left = percentOf(range.start);
  const width = percentOf(range.end) - left;
  return (
    <div
      ref={trackRef}
      className={`track${dragging === null ? '' : ' dragging'}`}
      onPointerDown={onPointerDown}
      onPointerMove={(e) => dragging !== null && move(dragging, minuteAt(e.clientX))}
      onPointerUp={() => setDragging(null)}
      onPointerCancel={() => setDragging(null)}
    >
      <div className="fill" style={{ left: `${left}%`, width: `${width}%` }} />
      {(['start', 'end'] as const).map((handle) => (
        <div
          key={handle}
          role="slider"
          tabIndex={0}
          className={`handle ${handle}`}
          data-handle={handle}
          style={{ left: `${percentOf(range[handle])}%` }}
          aria-label={`${label}の${handle === 'start' ? '開始' : '終了'}`}
          aria-valuemin={DAY_START_MINUTE}
          aria-valuemax={DAY_END_MINUTE}
          aria-valuenow={range[handle]}
          aria-valuetext={formatTimeOfDay(range[handle])}
          onKeyDown={onKeyDown(handle)}
        />
      ))}
    </div>
  );
}

/** 時刻の表示。クリックすると直接入力できる（分単位） */
function TimeText({
  label,
  minute,
  onCommit,
}: {
  label: string;
  minute: number;
  onCommit: (minute: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  if (text === null) {
    return (
      <button
        type="button"
        className="time"
        aria-label={`${label}を入力（${formatTimeOfDay(minute)}）`}
        onClick={() => setText(formatTimeOfDay(minute))}
      >
        {formatTimeOfDay(minute)}
      </button>
    );
  }
  const commit = () => {
    const parsed = parseTimeOfDay(text);
    if (parsed === null) {
      setInvalid(true);
      return;
    }
    onCommit(parsed);
    setText(null);
    setInvalid(false);
  };
  return (
    <span className="time-edit">
      <input
        aria-label={`${label}時刻`}
        aria-invalid={invalid}
        value={text}
        // biome-ignore lint/a11y/noAutofocus: クリックして入力欄に切り替えたので、そのまま打ち込めるようにする
        autoFocus
        onChange={(e) => {
          setText(e.target.value);
          setInvalid(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            setText(null);
            setInvalid(false);
          }
        }}
      />
      {invalid && <span className="field-error">20:00 や 翌1:30 のように入力してください</span>}
    </span>
  );
}

/** 1日の上限。よく使う値はボタンで、それ以外は「その他」で分を入力する */
function LimitPicker({
  label,
  limitMinutes,
  rangeMinutes,
  onChange,
}: {
  label: string;
  limitMinutes: number | null;
  rangeMinutes: number;
  onChange: (limitMinutes: number | null) => void;
}) {
  const [otherChosen, setOtherChosen] = useState(false);
  const isOther = otherChosen || !LIMIT_PRESETS.includes(limitMinutes);
  return (
    <div className="limit">
      <fieldset className="chips">
        <legend className="sr-only">{label}の1日の上限</legend>
        {LIMIT_PRESETS.map((preset) => (
          <label key={preset ?? 'none'} className="chip">
            <input
              type="radio"
              name={`${label}-limit`}
              checked={!isOther && limitMinutes === preset}
              onChange={() => {
                setOtherChosen(false);
                onChange(preset);
              }}
            />
            {preset === null ? 'なし' : formatDuration(preset * 60 * 1000)}
          </label>
        ))}
        <label className="chip">
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
      </fieldset>
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
      {limitMinutes !== null && limitMinutes >= rangeMinutes && (
        <p className="hint">時間帯より長いので、上限なしと同じです</p>
      )}
    </div>
  );
}
